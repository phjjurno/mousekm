// 모니터 설정 & 실거리 환산
// 선택한 모니터 인치 + 해상도로 PPI를 계산해 픽셀 이동량을 실제 물리 거리로 환산한다.
const KEY = 'mousekm.display.v1';

export const MONITOR_INCHES = [13.3, 14, 15.6, 16, 21.5, 24, 27, 32, 34, 43];
export const MAX_MONITORS = 4;

function currentRes() {
  const dpr = window.devicePixelRatio || 1;
  return {
    resW: Math.round(screen.width * dpr),
    resH: Math.round(screen.height * dpr),
  };
}

export function defaultMonitor() {
  return { inch: 24, ...currentRes() };
}

export function loadDisplay() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.monitors) && s.monitors.length) return s;
  } catch { /* 손상 시 기본값 */ }
  return { monitors: [defaultMonitor()] };
}

export function saveDisplay(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* noop */ }
}

// 모니터별 px/km을 평균 내 환산 비율 계산 (멀티 모니터는 평균 기준)
export function pxPerKm(settings) {
  const rates = settings.monitors.map((m) => {
    const diagPx = Math.hypot(m.resW || 1920, m.resH || 1080);
    const ppi = diagPx / (m.inch || 24);       // 인치당 픽셀
    return (ppi / 0.0254) * 1000;              // px per km
  });
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

// 1000px가 몇 cm인지 안내용 문구
export function conversionHint(settings) {
  const cm = (1000 / pxPerKm(settings)) * 100_000;
  return `현재 환산 기준: 1,000px ≈ ${cm.toFixed(1)}cm`;
}

// 해상도만으로 화면 크기(인치)를 추정한다.
// 브라우저는 물리적 크기를 알 수 없어, 화면 종류별 대표 PPI로 근사한다.
export function estimateInch(resW, resH, scale = 1) {
  const diag = Math.hypot(resW, resH);
  let ppi;
  if (scale >= 2)       ppi = diag < 4500 ? 245 : 218;  // 노트북 / 대형 레티나
  else if (diag > 4000) ppi = 157;                      // 4K
  else if (diag > 2800) ppi = 109;                      // QHD
  else                  ppi = 92;                       // FHD
  return Math.round((diag / ppi) * 10) / 10;
}

// 크롬 확장이 감지해 넘겨준 모니터 정보 (인치 포함) — 확장 브리지가 기록
function loadExtDisplays() {
  try {
    const d = JSON.parse(localStorage.getItem('mousekm.ext.display.v1'));
    const list = d?.displays;
    return Array.isArray(list) && list.length ? list : null;
  } catch { return null; }
}

// 모니터 자동 감지
// 1순위: 크롬 확장(chrome.system.display) — 대수·해상도·인치까지 감지
// 2순위: Window Management API — 대수·해상도는 정확, 인치는 추정
// 반환: { ok:true, screens:[{resW,resH,inch,estimated}], source:'ext'|'web' }
//     | { ok:false, reason:'unsupported'|'denied'|'error' }
export async function detectMonitors() {
  const ext = loadExtDisplays();
  if (ext) {
    return {
      ok: true,
      source: 'ext',
      screens: ext.map((m) => ({
        resW: m.resW, resH: m.resH,
        inch: m.inch, estimated: !!m.estimated,
      })),
    };
  }

  if (!('getScreenDetails' in window)) return { ok: false, reason: 'unsupported' };
  try {
    const details = await window.getScreenDetails();
    return {
      ok: true,
      source: 'web',
      screens: details.screens.map((sc) => {
        const dpr = sc.devicePixelRatio || 1;
        const resW = Math.round(sc.width * dpr);
        const resH = Math.round(sc.height * dpr);
        return { resW, resH, inch: estimateInch(resW, resH, dpr), estimated: true };
      }),
    };
  } catch (e) {
    return { ok: false, reason: e?.name === 'NotAllowedError' ? 'denied' : 'error' };
  }
}

export function isMultiScreen() {
  return 'isExtended' in screen ? screen.isExtended : false;
}
