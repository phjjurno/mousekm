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

// Window Management API로 연결된 모니터 감지 (Chrome 100+, "창 관리" 권한 필요)
// 해상도는 자동으로 채워지고 인치는 사용자가 선택한다.
// 반환: { ok:true, screens:[{resW,resH}] } | { ok:false, reason:'unsupported'|'denied'|'error' }
export async function detectMonitors() {
  if (!('getScreenDetails' in window)) return { ok: false, reason: 'unsupported' };
  try {
    const details = await window.getScreenDetails();
    return {
      ok: true,
      screens: details.screens.map((sc) => {
        const dpr = sc.devicePixelRatio || 1;
        return { resW: Math.round(sc.width * dpr), resH: Math.round(sc.height * dpr) };
      }),
    };
  } catch (e) {
    return { ok: false, reason: e?.name === 'NotAllowedError' ? 'denied' : 'error' };
  }
}

export function isMultiScreen() {
  return 'isExtended' in screen ? screen.isExtended : false;
}
