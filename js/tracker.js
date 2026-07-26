// 측정 엔진 — 입력 "내용"은 절대 다루지 않고 횟수·이동량만 누적한다.
// event.key, input.value, 클립보드, 화면 내용은 어떤 경우에도 읽거나 저장하지 않는다.
import { TRACKING } from './config.js?v=5';
import { todayKey, loadDay, saveDay, deleteDay, emptyRecord } from './storage.js?v=5';

export const STATUS = { OFF: 'off', RECORDING: 'recording', PAUSED: 'paused' };

export function createTracker() {
  let dateKey = todayKey();
  let state = loadDay(dateKey);
  let status = STATUS.OFF;

  let prevX = null, prevY = null;
  let lastMouseSample = 0;
  const listeners = { change: [], rollover: [] };

  const emit = (name) => listeners[name].forEach((fn) => fn(state, status));
  const now = () => Date.now();

  // 날짜가 바뀌면 이전 기록은 보존하고 새 기록을 시작한다
  function checkRollover() {
    const key = todayKey();
    if (key !== dateKey) {
      saveDay(dateKey, state);
      dateKey = key;
      state = loadDay(dateKey);
      prevX = prevY = null;
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
    state.scrollDistancePixels += Math.min(Math.abs(e.deltaY), TRACKING.WHEEL_DELTA_CAP) * (window.devicePixelRatio || 1);
    markActivity();
  }

  function onVisibility() {
    // 백그라운드 탭이 되면 마우스 좌표 기준점을 리셋해 점프 누적 방지
    prevX = prevY = null;
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
  setInterval(() => saveDay(dateKey, state), TRACKING.SAVE_INTERVAL_MS);
  window.addEventListener('pagehide', () => saveDay(dateKey, state));

  return {
    get state() { return state; },
    get status() { return status; },
    get dateKey() { return dateKey; },
    start() { status = STATUS.RECORDING; markActivity(); emit('change'); },
    pause() { status = STATUS.PAUSED; saveDay(dateKey, state); emit('change'); },
    resume() { status = STATUS.RECORDING; markActivity(); emit('change'); },
    reset() {
      deleteDay(dateKey);
      state = emptyRecord();
      prevX = prevY = null;
      emit('change');
    },
    setTitle(title) { state.title = title; saveDay(dateKey, state); },
    on(name, fn) { listeners[name].push(fn); },
  };
}
