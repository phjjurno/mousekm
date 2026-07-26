// 날짜별 localStorage 저장 — 서버 전송 없음, 모든 기록은 브라우저에만 저장
const STORE_KEY = 'mousekm.days.v1';

export function todayKey(d = new Date()) {
  // 사용자 로컬 시간 기준 YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function emptyRecord() {
  return {
    keyCount: 0,
    clickCount: 0,
    mouseDistancePixels: 0,
    scrollDistancePixels: 0,
    activeSeconds: 0,
    idleSeconds: 0,
    sessionStartedAt: null,
    lastActivityAt: null,
    title: null,
  };
}

function loadAll() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // 데이터 손상 시 빈 상태로 복구 (기존 손상 데이터는 무시)
    return {};
  }
}

export function loadDay(key = todayKey()) {
  const all = loadAll();
  return { ...emptyRecord(), ...(all[key] || {}) };
}

export function saveDay(key, record) {
  try {
    const all = loadAll();
    all[key] = record;
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    // 저장 공간 부족 등 — 측정 자체는 계속 진행
  }
}

export function deleteDay(key) {
  const all = loadAll();
  delete all[key];
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch { /* noop */ }
}

// 저장된 모든 날짜의 이동 픽셀 합계 — 누적(평생) 여행 지도용
export function loadLifetimeTotals() {
  const all = loadAll();
  let mousePx = 0, scrollPx = 0;
  for (const key in all) {
    const r = all[key];
    if (!r) continue;
    mousePx  += r.mouseDistancePixels  || 0;
    scrollPx += r.scrollDistancePixels || 0;
  }
  return { mousePx, scrollPx };
}

// 이번 주(월~일) 기록 목록 반환 — 주간 대시보드용
export function loadThisWeek(now = new Date()) {
  const all = loadAll();
  const day = now.getDay(); // 0=일
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = todayKey(d);
    days.push({ key, date: d, record: all[key] ? { ...emptyRecord(), ...all[key] } : null });
  }
  return days;
}
