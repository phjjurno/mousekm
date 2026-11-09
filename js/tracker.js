// 측정 엔진 — 입력 "내용"은 절대 다루지 않고 횟수·이동량만 누적한다.
// event.key, input.value, 클립보드, 화면 내용은 어떤 경우에도 읽거나 저장하지 않는다.
import { TRACKING } from './config.js?v=10';
import { todayKey, loadDay, mergeDay, deleteDay, emptyRecord, invalidatePastTotals } from './storage.js?v=10';

export const STATUS = { OFF: 'off', RECORDING: 'recording', PAUSED: 'paused' };
const STATUS_KEY = 'mousekm.status.v1';

// 새로고침해도 측정 상태(기록 중/일시정지)를 이어간다
function loadStatus() {
  try {
    const s = localStorage.getItem(STATUS_KEY);
    return Object.values(STATUS).includes(s) ? s : STATUS.OFF;
  } catch { return STATUS.OFF; }
}
function saveStatus(s) {
  try { localStorage.setItem(STATUS_KEY, s); } catch { /* noop */ }
}

// wheel 이벤트의 deltaMode(줄/페이지 단위)를 픽셀로 맞춘다 (Firefox는 줄 단위라 과소 측정됨)
function wheelPixels(e) {
  const d = Math.abs(e.deltaY);
  if (e.deltaMode === 1) return d * 40;                          // DOM_DELTA_LINE
  if (e.deltaMode === 2) return d * (window.innerHeight || 800); // DOM_DELTA_PAGE
  return d;
}

export function createTracker() {
  let dateKey = todayKey();
  let state = loadDay(dateKey);
  let base = { ...state };          // 마지막 저장 시점의 값 — 증분 병합의 기준
  let status = loadStatus();

  let prevX = null, prevY = null;
  let lastMouseSample = 0;
  const listeners = { change: [], rollover: [] };

  const emit = (name) => listeners[name].forEach((fn) => fn(state, status));
  const now = () => Date.now();

  // 이 탭의 증가분만 저장소에 더하고, 다른 탭이 더한 값까지 반영된 최신 기록으로 갱신
  function persist() {
    const merged = mergeDay(dateKey, state, base);
    if (!merged) return;
    state = { ...merged };
    base = { ...merged };
  }

  // 날짜가 바뀌면 이전 기록은 보존하고 새 기록을 시작한다
  function checkRollover() {
    const key = todayKey();
    if (key !== dateKey) {
      persist();
      dateKey = key;
      state = loadDay(dateKey);
      base = { ...state };
      prevX = prevY = null;
      invalidatePastTotals();
      emit('rollover');
    }
  }

  function markActivity() {
    state.lastActivityAt = now();
    if (!state.sessionStartedAt) state.sessionStartedAt = now();
  }

  const isRecording = () => status === STATUS.RECORDING && !document.hidden;

  // ── 이벤트 핸들러: 횟수와 이동량만 증가 ──
  function onKeydown(e) {
    if (!isRecording()) return;
    // 비밀번호 입력창에서는 횟수 측정도 하지 않는다
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'password') return;
    if (e.repeat) return;           // 키를 누르고 있을 때의 자동 반복은 1타로만 센다
    checkRollover();
    state.keyCount += 1; // event.key는 읽지 않음
    markActivity();
  }

  function onClick() {
    if (!isRecording()) return;
    checkRollover();
    state.clickCount += 1;
    markActivity();
  }

  function onMouseMove(e) {
    if (!isRecording()) return;
    const t = now();
    if (t - lastMouseSample < TRACKING.MOUSEMOVE_THROTTLE_MS) return; // 스로틀링
    lastMouseSample = t;
    if (prevX !== null) {
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      // clientX/Y는 CSS 픽셀 → 물리 픽셀로 환산해 누적 (모니터 PPI 기준 거리 계산과 단위 일치)
      state.mouseDistancePixels += Math.sqrt(dx * dx + dy * dy) * (window.devicePixelRatio || 1);
    }
    prevX = e.clientX;
    prevY = e.clientY;
    markActivity();
  }

  function onWheel(e) {
    if (!isRecording()) return;
    checkRollover();
    state.scrollDistancePixels += Math.min(wheelPixels(e), TRACKING.WHEEL_DELTA_CAP) * (window.devicePixelRatio || 1);
    markActivity();
  }

  function onVisibility() {
    // 백그라운드 탭이 되면 마우스 좌표 기준점을 리셋해 점프 누적 방지 + 즉시 저장
    prevX = prevY = null;
    if (document.hidden) persist();
    emit('change');
  }

  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  // 활동/유휴 시간: 1초마다 판정 (기록 중 + 탭 활성 상태에서만)
  setInterval(() => {
    checkRollover();
    if (status !== STATUS.RECORDING || document.hidden) return;
    const idleFor = state.lastActivityAt ? now() - state.lastActivityAt : Infinity;
    if (idleFor < TRACKING.IDLE_THRESHOLD_MS) state.activeSeconds += 1;
    else state.idleSeconds += 1;
  }, 1000);

  // 주기 저장 + 종료 직전 저장 (매 이벤트 저장 금지 — 성능)
  setInterval(persist, TRACKING.SAVE_INTERVAL_MS);
  window.addEventListener('pagehide', persist);

  function setStatus(s) {
    status = s;
    saveStatus(s);
  }

  return {
    get state() { return state; },
    get status() { return status; },
    get dateKey() { return dateKey; },
    start() { setStatus(STATUS.RECORDING); markActivity(); emit('change'); },
    pause() { setStatus(STATUS.PAUSED); persist(); emit('change'); },
    resume() { setStatus(STATUS.RECORDING); markActivity(); emit('change'); },
    reset() {
      deleteDay(dateKey);
      state = emptyRecord();
      base = { ...state };
      prevX = prevY = null;
      emit('change');
    },
    // 칭호는 값만 바꿔두고 주기 저장 때 함께 기록한다 (예전엔 0.6초마다 전체 저장소를 다시 썼음)
    setTitle(title) { state.title = title; },
    persist,
    on(name, fn) { listeners[name].push(fn); },
  };
}
