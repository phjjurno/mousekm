// 모두의 손끝 여행 — 방문자들의 이동 거리를 합쳐 하나의 전국 일주로 보여준다.
// 서버로 보내는 것은 "이번에 늘어난 거리(km) 숫자"와 "오늘 처음 참여했는지" 뿐이다.
// 비용: 기록 중인 탭당 5분에 한 번 문서 2개 쓰기, 보는 사람당 3분에 한 번 문서 2개 읽기 (Spark 무료 한도 내)
import { getFirebase } from './fb.js?v=10';
import { ROUTES } from './routes.js?v=10';
import { getJourney } from './journey.js?v=10';

const STATS = 'mousekm_stats';
const REC_KEY = 'mousekm.together.v1';
const MAX_DELTA_KM = 2;           // 규칙과 동일 (한 번에 보탤 수 있는 최대 거리)
const CONTRIB_MS = 5 * 60_000;
const REFRESH_MS = 3 * 60_000;
const ROUTE_KM = ROUTES[ROUTES.length - 1].km;

const $ = (s) => document.querySelector(s);

let deps = null;
let latest = { todayKm: 0, todayTravelers: 0, allKm: 0, allTravelers: 0, at: null };
let shown = { todayKm: 0, allKm: 0 };
let busy = false;

function loadRec() {
  try { return JSON.parse(localStorage.getItem(REC_KEY)) || {}; } catch { return {}; }
}
function saveRec(r) {
  try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch { /* noop */ }
}

export function fmtKmBig(km) {
  if (km >= 1000) return `${Math.round(km).toLocaleString()}km`;
  if (km >= 10)   return `${km.toFixed(1)}km`;
  if (km >= 1)    return `${km.toFixed(2)}km`;
  return `${Math.round(km * 1000)}m`;
}

function josaEulReul(word) {
  const ch = String(word).slice(-1).charCodeAt(0);
  if (ch < 0xac00 || ch > 0xd7a3) return '을(를)';
  return (ch - 0xac00) % 28 ? '을' : '를';
}

// 이번에 보탤 거리 계산: 사이트 오늘 기록 + 확장 누적 기록 중 아직 안 보탠 부분
function pendingPx(rec) {
  const { px: siteNow, day } = deps.getSitePx();
  let siteBase = rec.day === day ? (rec.sitePx || 0) : 0;
  if (siteNow < siteBase) siteBase = siteNow;              // 오늘 기록을 초기화한 경우
  const extNow = deps.getExtPx();
  let extBase = rec.extPx || 0;
  if (extNow < extBase) extBase = extNow;                  // 확장 데이터를 지운 경우
  return { day, siteNow, siteBase, sitePending: siteNow - siteBase, extNow, extBase, extPending: extNow - extBase };
}

async function contribute() {
  if (busy || document.hidden || !deps) return;
  const rec = loadRec();
  const p = pendingPx(rec);
  const rate = deps.getKmRate();
  const pendingKm = (p.sitePending + p.extPending) / rate;
  if (pendingKm < 0.005) return;                           // 5m 미만은 모아뒀다가 다음에

  const deltaKm = Math.round(Math.min(pendingKm, MAX_DELTA_KM) * 1000) / 1000;
  const usePx = deltaKm * rate;
  const siteUse = Math.min(p.sitePending, usePx);
  const extUse = Math.min(p.extPending, Math.max(0, usePx - siteUse));
  const firstToday = rec.joinedDay !== p.day;
  const firstEver = !rec.joinedEver;

  busy = true;
  try {
    const { db, FieldValue } = await getFirebase();
    const ts = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(db.collection(STATS).doc(p.day), {
      km: FieldValue.increment(deltaKm),
      travelers: FieldValue.increment(firstToday ? 1 : 0),
      updatedAt: ts,
    }, { merge: true });
    batch.set(db.collection(STATS).doc('all'), {
      km: FieldValue.increment(deltaKm),
      travelers: FieldValue.increment(firstEver ? 1 : 0),
      updatedAt: ts,
    }, { merge: true });
    await batch.commit();

    saveRec({
      ...rec,
      day: p.day,
      sitePx: p.siteBase + siteUse,
      extPx: p.extBase + extUse,
      joinedDay: p.day,
      joinedEver: true,
      myKm: Math.round(((rec.myKm || 0) + deltaKm) * 1000) / 1000,
    });
    // 내 기여를 바로 화면에 반영(서버 값은 다음 갱신 때 맞춰짐)
    latest.todayKm += deltaKm;
    latest.allKm += deltaKm;
    if (firstToday) latest.todayTravelers += 1;
    if (firstEver) latest.allTravelers += 1;
    render();
  } catch {
    /* 한도 초과·오프라인 등 — 조용히 다음 주기에 재시도 */
  } finally {
    busy = false;
  }
}

async function refresh() {
  if (document.hidden) return;
  try {
    const { db } = await getFirebase();
    const day = deps.getSitePx().day;
    const [dSnap, aSnap] = await Promise.all([
      db.collection(STATS).doc(day).get(),
      db.collection(STATS).doc('all').get(),
    ]);
    const d = dSnap.exists ? dSnap.data() : {};
    const a = aSnap.exists ? aSnap.data() : {};
    latest = {
      todayKm: Number(d.km) || 0,
      todayTravelers: Number(d.travelers) || 0,
      allKm: Number(a.km) || 0,
      allTravelers: Number(a.travelers) || 0,
      at: new Date(),
    };
    const section = $('#together');
    if (section) section.dataset.state = 'ok';
    render();
  } catch {
    const section = $('#together');
    if (section && section.dataset.state !== 'ok') section.dataset.state = 'error';
    const st = $('#tg-status');
    if (st && section?.dataset.state === 'error') st.textContent = '지금은 모두의 여행 기록을 불러올 수 없어요.';
  }
}

// 숫자가 부드럽게 올라가는 효과
function tween(key, target, apply) {
  const from = shown[key];
  if (Math.abs(target - from) < 1e-6) { apply(target); return; }
  const t0 = performance.now();
  const dur = 900;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - (1 - k) ** 3;
    const v = from + (target - from) * eased;
    shown[key] = v;
    apply(v);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function render() {
  const all = latest.allKm;
  const lap = Math.floor(all / ROUTE_KM);
  const j = getJourney(all - lap * ROUTE_KM);
  const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };

  setText('#tg-lap', `${lap + 1}바퀴째`);
  const sentence = $('#tg-sentence');
  if (sentence) {
    sentence.innerHTML = `모두의 손끝은 지금 <strong>${lap + 1}바퀴째</strong> 전국 일주 중<br>`
      + `<strong>${j.fromName}</strong>${josaEulReul(j.fromName)} 지나 <strong>${j.toName}</strong> 방향으로 가고 있어요`;
  }
  const fill = $('#tg-fill');
  if (fill) fill.style.width = `${(j.progress * 100).toFixed(1)}%`;
  const pin = $('#tg-pin');
  if (pin) pin.style.left = `${(j.progress * 100).toFixed(1)}%`;
  setText('#tg-from', j.fromName);
  setText('#tg-to', j.toName);
  setText('#tg-remain', `${j.toName}까지 ${fmtKmBig(j.remainKm)}`);

  tween('allKm', latest.allKm, (v) => setText('#tg-all-km', fmtKmBig(v)));
  tween('todayKm', latest.todayKm, (v) => setText('#tg-today-km', fmtKmBig(v)));
  setText('#tg-today-travelers', `${latest.todayTravelers.toLocaleString()}명`);
  setText('#tg-all-travelers', `${latest.allTravelers.toLocaleString()}명`);

  const rec = loadRec();
  setText('#tg-mine', rec.myKm ? fmtKmBig(rec.myKm) : '아직 없음');
  const share = latest.allKm > 0 && rec.myKm ? (rec.myKm / latest.allKm) * 100 : 0;
  setText('#tg-mine-share', share ? `전체의 ${share < 0.1 ? '0.1% 미만' : share.toFixed(1) + '%'}` : '측정을 시작하면 함께 달려요');

  const st = $('#tg-status');
  if (st && latest.at) {
    st.textContent = `3분마다 새로고침 · ${latest.at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준`;
  }
  heroTick();
}

// 히어로의 라이브 알약: 오늘 함께한 사람 수 ↔ 게시판 최신 소식 번갈아 보여주기
let heroMode = 0;
let latestWall = null;
function heroTick() {
  const pill = $('#hero-live');
  const text = $('#hero-live-text');
  if (!pill || !text) return;
  const stats = latest.todayTravelers > 0
    ? `오늘 <b>${latest.todayTravelers.toLocaleString()}명</b>이 함께 <b>${fmtKmBig(latest.todayKm)}</b> 여행했어요`
    : (latest.allKm > 0 ? `지금까지 모두 함께 <b>${fmtKmBig(latest.allKm)}</b> 여행했어요` : null);
  const options = [stats, latestWall].filter(Boolean);
  if (!options.length) { pill.hidden = true; return; }
  pill.hidden = false;
  text.innerHTML = options[heroMode % options.length];
}

export function initCommunity(d) {
  deps = d;
  window.addEventListener('mousekm:wall-latest', (e) => {
    latestWall = e.detail?.html || null;
    heroTick();
  });
  setInterval(() => { heroMode += 1; heroTick(); }, 6000);

  refresh();
  setTimeout(contribute, 20_000);           // 확장 기록 등 쌓인 거리를 첫 방문에 곧 반영
  setInterval(contribute, CONTRIB_MS);
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

// 도시 도착 등 의미 있는 순간엔 바로 한 번 보탠다
export function contributeNow() { contribute(); }
