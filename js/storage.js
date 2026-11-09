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
  invalidatePastTotals();
}

const NUM_FIELDS = ['keyCount', 'clickCount', 'mouseDistancePixels', 'scrollDistancePixels', 'activeSeconds', 'idleSeconds'];

// 증분 병합 저장 — 마지막 저장(base) 이후 이 탭에서 늘어난 만큼만 저장값에 더한다.
// 통째로 덮어쓰면 mousekm 탭이 여러 개일 때 서로의 기록을 지워버린다.
// 반환: 병합된 최신 기록(다른 탭의 증가분 포함) — 호출한 쪽은 이것을 새 state/base로 쓴다.
export function mergeDay(key, state, base) {
  try {
    const all = loadAll();
    const stored = { ...emptyRecord(), ...(all[key] || {}) };
    let changed = false;
    for (const f of NUM_FIELDS) {
      const delta = (state[f] || 0) - (base[f] || 0);
      if (delta !== 0) changed = true;
      stored[f] = Math.max(0, (stored[f] || 0) + delta);
    }
    if (state.lastActivityAt && state.lastActivityAt !== stored.lastActivityAt) {
      stored.lastActivityAt = Math.max(stored.lastActivityAt || 0, state.lastActivityAt);
      changed = true;
    }
    if (!stored.sessionStartedAt && state.sessionStartedAt) {
      stored.sessionStartedAt = state.sessionStartedAt;
      changed = true;
    }
    if (state.title && state.title !== stored.title) {
      stored.title = state.title;
      changed = true;
    }
    if (changed) {
      all[key] = stored;
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
    }
    return stored;
  } catch {
    return null; // 저장 공간 부족 등 — 측정은 계속한다
  }
}

// 오늘을 제외한 모든 날짜의 이동 픽셀 합계 (누적 여행용). 매 렌더마다 전체 JSON을
// 파싱하지 않도록 캐시하고, 날짜 변경·초기화·다른 탭의 저장 때만 다시 계산한다.
let pastCache = null;
export function loadPastTotals(todayKeyStr) {
  if (pastCache && pastCache.key === todayKeyStr) return pastCache;
  const all = loadAll();
  let mousePx = 0, scrollPx = 0;
  for (const k in all) {
    if (k === todayKeyStr || !all[k]) continue;
    mousePx  += all[k].mouseDistancePixels  || 0;
    scrollPx += all[k].scrollDistancePixels || 0;
  }
  pastCache = { key: todayKeyStr, mousePx, scrollPx };
  return pastCache;
}
export function invalidatePastTotals() { pastCache = null; }

// 기록이 있는 날짜 목록 (연속 기록 계산용)
export function loadActiveDayKeys() {
  const all = loadAll();
  return Object.keys(all).filter((k) => {
    const r = all[k];
    return r && ((r.mouseDistancePixels || 0) + (r.scrollDistancePixels || 0) > 0 || (r.keyCount || 0) > 0);
  });
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
