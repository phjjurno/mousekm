// 도전장 — "오늘 나는 이만큼 갔어요, 따라잡아 볼래요?" 링크를 만들고 받는다.
// 링크에는 닉네임·오늘 거리·현재 구간만 담긴다(서버 저장 없음, URL 안에만 존재).
import { ROUTES, START_NAME } from './routes.js?v=10';
import { filterContent } from './wall.js?v=10';

const PLACES = new Set([START_NAME, ...ROUTES.map((r) => r.name)]);
const TARGET_KEY = 'mousekm.challenge.v1';
const SHARED_KEY = 'mousekm.challenge.shared';
const TARGET_TTL_MS = 3 * 86_400_000;

function b64urlEncode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// 받은 값은 전부 신뢰하지 않고 형식·범위·금칙어를 검사한다
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const n = String(raw.n || '').normalize('NFC').trim().slice(0, 12);
  const k = Number(raw.k);
  const f = String(raw.f || '');
  const t = String(raw.t || '');
  if (!n || !filterContent(n).ok) return null;
  if (!Number.isFinite(k) || k <= 0 || k > 200) return null;
  if (!PLACES.has(f) || !PLACES.has(t)) return null;
  return { n, k: Math.round(k * 1000) / 1000, f, t, at: Date.now() };
}

export function buildChallengeUrl({ nick, km, from, to }) {
  const payload = { n: nick, k: Math.round(km * 1000) / 1000, f: from, t: to };
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('vs', b64urlEncode(payload));
  return url.toString();
}

export function readChallengeFromUrl() {
  const vs = new URLSearchParams(window.location.search).get('vs');
  if (!vs || vs.length > 400) return null;
  try { return sanitize(b64urlDecode(vs)); } catch { return null; }
}

export function clearChallengeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('vs');
  history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
}

export function saveTarget(ch) {
  try { localStorage.setItem(TARGET_KEY, JSON.stringify({ ...ch, won: false })); } catch { /* noop */ }
}
export function loadTarget() {
  try {
    const v = JSON.parse(localStorage.getItem(TARGET_KEY));
    if (!v || Date.now() - (v.at || 0) > TARGET_TTL_MS) return null;
    return v;
  } catch { return null; }
}
export function markTargetWon() {
  const v = loadTarget();
  if (!v) return;
  v.won = true;
  try {
    localStorage.setItem(TARGET_KEY, JSON.stringify(v));
    localStorage.setItem('mousekm.challenge.won', '1');
  } catch { /* noop */ }
}
export function clearTarget() {
  try { localStorage.removeItem(TARGET_KEY); } catch { /* noop */ }
}
export function hasShared() {
  try { return localStorage.getItem(SHARED_KEY) === '1'; } catch { return false; }
}
export function hasWon() {
  try { return localStorage.getItem('mousekm.challenge.won') === '1'; } catch { return false; }
}

// 공유: 모바일 등 지원 환경은 카드 이미지+링크를 함께, 아니면 링크 복사
// 반환: 'shared' | 'copied' | 'aborted' | 'failed'
export async function shareChallenge({ url, text, canvas }) {
  const title = 'mousekm 도전장 🏁';
  try {
    if (canvas && navigator.canShare) {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (blob) {
        const file = new File([blob], 'mousekm-challenge.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text: `${text}\n${url}`, files: [file] });
          markShared();
          return 'shared';
        }
      }
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      markShared();
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'aborted';
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    markShared();
    return 'copied';
  } catch {
    return 'failed';
  }
}

function markShared() {
  try { localStorage.setItem(SHARED_KEY, '1'); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent('mousekm:shared'));
}
