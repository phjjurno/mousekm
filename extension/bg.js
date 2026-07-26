// mousekm 확장 — 백그라운드(서비스 워커)
// 콘텐츠 스크립트가 보낸 수치 델타를 날짜별로 누적 저장한다. 내용 데이터는 존재하지 않는다.
'use strict';

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── 저장 유틸 (Promise) ──
const getLocal = (defaults) => new Promise((res) => chrome.storage.local.get(defaults, res));
const setLocal = (obj) => new Promise((res) => chrome.storage.local.set(obj, res));

// 동시 메시지로 인한 read-modify-write 경합 방지용 직렬 큐
let queue = Promise.resolve();

async function applyDelta(msg) {
  const { days } = await getLocal({ days: {} });
  const k = todayKey();
  const d = days[k] || { keys: 0, clicks: 0, mousePx: 0, scrollPx: 0, activeSec: 0 };
  d.keys      += msg.keys      || 0;
  d.clicks    += msg.clicks    || 0;
  d.mousePx   += msg.mousePx   || 0;
  d.scrollPx  += msg.scrollPx  || 0;
  d.activeSec += msg.activeSec || 0;
  days[k] = d;
  await setLocal({ days });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'mousekm:delta') return;
  // 중요: 저장이 끝난 뒤 sendResponse를 호출하고 true를 반환해야
  // 서비스 워커가 비동기 저장 도중 종료되지 않는다(팝업이 닫혀 있어도 기록 유지).
  queue = queue
    .then(() => applyDelta(msg))
    .catch(() => {})
    .then(() => { try { sendResponse({ ok: true }); } catch {} });
  return true;
});

// ── 모니터 정보 감지 (인치까지) ──
// chrome.system.display는 dpiX/dpiY와 네이티브 해상도를 제공한다.
// 플랫폼에 따라 dpi가 논리값일 수 있어, 물리 대각선이 상식 범위(10~60인치)일 때만 실측으로 신뢰한다.
function currentMode(d) {
  return (d.modes || []).find((m) => m.isSelected) || null;
}

function nativeRes(d) {
  const mode = currentMode(d);
  const scale = mode?.deviceScaleFactor || 1;
  return {
    resW: mode?.widthInNativePixels  || Math.round((d.bounds?.width  || 0) * scale),
    resH: mode?.heightInNativePixels || Math.round((d.bounds?.height || 0) * scale),
    scale,
  };
}

// 해상도만으로 화면 크기를 추정 (dpi를 신뢰할 수 없을 때의 대비책)
function estimateInch(resW, resH, scale) {
  const diag = Math.hypot(resW, resH);
  let ppi;
  if (scale >= 2)        ppi = diag < 4500 ? 245 : 218;  // 노트북 / 대형 레티나
  else if (diag > 4000)  ppi = 157;                      // 4K
  else if (diag > 2800)  ppi = 109;                      // QHD
  else                   ppi = 92;                       // FHD
  return Math.round((diag / ppi) * 10) / 10;
}

function measuredInch(d, res) {
  if (!(d.dpiX > 0) || !(d.dpiY > 0)) return null;
  const cands = [
    Math.hypot((d.bounds?.width || 0) / d.dpiX, (d.bounds?.height || 0) / d.dpiY), // dpi가 DIP 기준
    Math.hypot(res.resW / d.dpiX, res.resH / d.dpiY),                              // dpi가 네이티브 기준
  ];
  const est = estimateInch(res.resW, res.resH, res.scale);
  // 상식 범위 안에서 추정치와 가장 가까운 해석을 채택
  const ok = cands.filter((v) => Number.isFinite(v) && v >= 10 && v <= 60);
  if (!ok.length) return null;
  ok.sort((a, b) => Math.abs(a - est) - Math.abs(b - est));
  return Math.round(ok[0] * 10) / 10;
}

function readDisplays() {
  return new Promise((resolve) => {
    if (!chrome.system?.display?.getInfo) return resolve([]);
    try {
      chrome.system.display.getInfo({}, (infos) => {
        if (chrome.runtime.lastError || !Array.isArray(infos)) return resolve([]);
        resolve(infos
          .filter((d) => d.isEnabled !== false && !d.mirroringSourceId)
          .map((d) => {
            const res = nativeRes(d);
            const inch = measuredInch(d, res);
            return {
              name: d.name || '',
              resW: res.resW,
              resH: res.resH,
              inch: inch ?? estimateInch(res.resW, res.resH, res.scale),
              estimated: inch === null,
            };
          }));
      });
    } catch { resolve([]); }
  });
}

async function refreshDisplays() {
  const displays = await readDisplays();
  if (displays.length) await setLocal({ displays, displaysAt: Date.now() });
}

chrome.runtime.onInstalled.addListener(() => {
  refreshDisplays();
  // 설치/업데이트 직후: 이미 열려 있던 탭에도 측정 스크립트를 주입한다
  // (기본 content_scripts는 이후에 여는 페이지에만 들어가므로, 새로고침 없이 바로 동작하게)
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
    for (const t of tabs) {
      if (!t.id) continue;
      chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] })
        .catch(() => { /* chrome://, 웹스토어 등 주입 불가 탭은 무시 */ });
    }
  });
});

chrome.runtime.onStartup.addListener(refreshDisplays);
if (chrome.system?.display?.onDisplayChanged) {
  chrome.system.display.onDisplayChanged.addListener(refreshDisplays);
}
