// mousekm 확장 — 측정 콘텐츠 스크립트
// 사이트와 동일한 개인정보 원칙: event.key/입력값/클립보드/화면 내용은 절대 읽지 않는다.
// 오직 횟수(키·클릭)와 이동량(마우스·스크롤 물리 px), 활동 시간만 누적한다.
(() => {
  'use strict';

  // 이중 주입 방지 (설치 시 자동 주입 + 선언적 주입이 겹칠 수 있음)
  if (window.__mousekmTracking) return;
  window.__mousekmTracking = true;

  // mousekm 사이트 자체는 페이지 내 트래커가 측정하므로 제외 (이중 측정 방지)
  const EXCLUDED_HOSTS = new Set(['mousekm.ws-qf.com', 'localhost:8934', '127.0.0.1:8934']);
  if (EXCLUDED_HOSTS.has(location.host)) return;
  if (window !== window.top) return; // 최상위 프레임만 (iframe 중복 방지)

  const MOUSEMOVE_THROTTLE_MS = 60;
  const WHEEL_DELTA_CAP = 150;      // CSS px, 1회 상한
  const IDLE_THRESHOLD_MS = 60_000;
  const FLUSH_INTERVAL_MS = 5_000;

  let recording = true;             // 기본 ON — 팝업에서 일시정지 가능
  let keys = 0, clicks = 0, mousePx = 0, scrollPx = 0, activeSec = 0;
  let prevX = null, prevY = null, lastMouseSample = 0, lastActivity = 0;

  chrome.storage.local.get({ recording: true }, (v) => { recording = !!v.recording; });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && 'recording' in ch) recording = !!ch.recording.newValue;
  });

  const isRecording = () => recording && !document.hidden;
  const mark = () => { lastActivity = Date.now(); };

  document.addEventListener('keydown', (e) => {
    if (!isRecording()) return;
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'password') return; // 횟수도 세지 않음
    keys += 1; // event.key는 읽지 않음
    mark();
  }, true);

  document.addEventListener('click', () => {
    if (!isRecording()) return;
    clicks += 1;
    mark();
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!isRecording()) return;
    const now = Date.now();
    if (now - lastMouseSample < MOUSEMOVE_THROTTLE_MS) return;
    lastMouseSample = now;
    if (prevX !== null) {
      const dx = e.clientX - prevX, dy = e.clientY - prevY;
      mousePx += Math.sqrt(dx * dx + dy * dy) * (window.devicePixelRatio || 1);
    }
    prevX = e.clientX; prevY = e.clientY;
    mark();
  }, { passive: true });

  document.addEventListener('wheel', (e) => {
    if (!isRecording()) return;
    scrollPx += Math.min(Math.abs(e.deltaY), WHEEL_DELTA_CAP) * (window.devicePixelRatio || 1);
    mark();
  }, { passive: true });

  document.addEventListener('visibilitychange', () => { prevX = prevY = null; });

  // 활동 시간: 최근 60초 내 입력이 있으면 1초씩 적립
  setInterval(() => {
    if (!isRecording()) return;
    if (lastActivity && Date.now() - lastActivity < IDLE_THRESHOLD_MS) activeSec += 1;
  }, 1000);

  function flush() {
    if (!keys && !clicks && !mousePx && !scrollPx && !activeSec) return;
    const delta = { type: 'mousekm:delta', keys, clicks, mousePx, scrollPx, activeSec };
    const sent = { keys, clicks, mousePx, scrollPx, activeSec };
    keys = clicks = mousePx = scrollPx = activeSec = 0;
    try {
      // 콜백을 넘겨 응답을 기다린다 → 서비스 워커가 저장을 마칠 때까지 살아 있게 된다
      chrome.runtime.sendMessage(delta, () => {
        if (chrome.runtime.lastError) {
          // 워커 미기동 등 전달 실패 — 다음 주기에 다시 보내도록 되돌린다
          keys += sent.keys; clicks += sent.clicks;
          mousePx += sent.mousePx; scrollPx += sent.scrollPx; activeSec += sent.activeSec;
        }
      });
    } catch {
      keys += sent.keys; clicks += sent.clicks;
      mousePx += sent.mousePx; scrollPx += sent.scrollPx; activeSec += sent.activeSec;
    }
  }

  setInterval(flush, FLUSH_INTERVAL_MS);
  // 탭을 숨기거나 떠날 때도 즉시 저장 (백그라운드 타이머 지연 대비)
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
  window.addEventListener('blur', flush);
})();
