// 손끝 응원 방명록 — 익명 한 줄 메시지 + 도착·완등 소식 + 공감
// 개인정보 원칙 유지: 닉네임과 사용자가 직접 남긴 한 줄, 그리고 사용자가 공유를 허락한
// "도착한 도시/오른 산 이름"만 저장한다. 측정 데이터(키·마우스 내용)와는 완전히 분리된다.
import { getFirebase, localSet } from './fb.js?v=10';

const COLLECTION    = 'mousekm_wall';
const MAX_NICK      = 12;
const MAX_TEXT      = 100;
const LIST_LIMIT    = 50;
const COOLDOWN_MS   = 20_000;
const EVENT_COOLDOWN_MS = 60_000;
const NICK_KEY      = 'mousekm.wall.nick';
const LAST_POST_KEY = 'mousekm.wall.lastPost';
const LAST_EVENT_KEY = 'mousekm.wall.lastEvent';
const AUTOSHARE_KEY = 'mousekm.wall.autoshare';
const POSTED_KEY    = 'mousekm.wall.posted';

const liked  = localSet('mousekm.wall.liked');
const shared = localSet('mousekm.wall.sharedPlaces');

let db = null;
let uid = null;
let FieldValue = null;
let lastSnap = null;

const $ = (s) => document.querySelector(s);

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── 콘텐츠 필터: 욕설 · 광고/스팸 · 개인정보 ──
const BADWORDS = [
  '시발', '씨발', '씨바', '시바', '씨불', '시불', 'ㅅㅂ', '병신', 'ㅂㅅ', 'ㅄ',
  '지랄', 'ㅈㄹ', '개새', '새끼', 'ㅅㄲ', '좆', '존나', '졸라', '좃', '닥쳐',
  '꺼져', '엿먹', '창녀', '걸레', '개년', '미친놈', '미친년', '썅', '쌍놈',
  '썩을', '뒤져', '디져', '느금', '니애미', 'fuck', 'shit', 'bitch', 'asshole',
];
const PII_PATTERNS = [
  /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/,        // 휴대폰
  /\d{6}[-\s]?[1-4]\d{6}/,                        // 주민등록번호
  /[\w.+-]+@[\w-]+\.[\w.-]+/,                     // 이메일
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,   // 카드번호
  /(계좌|입금)\s*[:：]?\s*\d{6,}/,                 // 계좌번호
];
const AD_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /[\w-]+\.(com|net|kr|io|shop|xyz|link|me|gg|top|vip)\b/i,
  /(카톡|카카오톡|오픈채팅|오픈카톡|텔레그램|텔레|라인문의|wechat|위쳇)\s*[:：]?/i,
  /(대출|카지노|토토|바카라|배팅|베팅|먹튀|성인|비아그라|시알리스|조건만남|홍보문의|광고문의|디비\s*(팝|삽)|수익\s*보장|부업|재택\s*알바)/i,
];

// 반환: { ok: true } 또는 { ok: false, reason } — 도전장 닉네임 검사에도 쓴다
export function filterContent(text) {
  const t = String(text || '').normalize('NFC').trim();
  for (const re of PII_PATTERNS) {
    if (re.test(t)) return { ok: false, reason: '전화번호·이메일·계좌 등 개인정보가 포함된 글은 남길 수 없어요.' };
  }
  for (const re of AD_PATTERNS) {
    if (re.test(t)) return { ok: false, reason: '링크·광고·홍보성 문구는 남길 수 없어요.' };
  }
  const norm = t.toLowerCase().replace(/[\s._\-*~^ㅤ0-9]/g, '');
  for (const w of BADWORDS) {
    if (norm.includes(w)) return { ok: false, reason: '욕설·비속어가 포함된 글은 남길 수 없어요.' };
  }
  return { ok: true };
}

// 혹시 필터를 우회해 저장된 글이 있어도 화면에서는 민감정보를 가린다(방어)
function maskSensitive(text) {
  return String(text)
    .replace(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, '●●●-●●●●-●●●●')
    .replace(/\d{6}[-\s]?[1-4]\d{6}/g, '******-*******')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '●●●@●●●')
    .replace(/https?:\/\/\S+/gi, '[링크 삭제됨]');
}

function relTime(date) {
  if (!date) return '방금';
  const sec = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (sec < 60)    return '방금';
  if (sec < 3600)  return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
}

// 받침 유무로 조사 고르기 (강릉에 / 부산에 는 공통, 을/를 등은 main에서 사용)
export function josa(word, withFinal, withoutFinal) {
  const ch = String(word).normalize('NFC').slice(-1).charCodeAt(0);
  if (ch < 0xac00 || ch > 0xd7a3) return withFinal + '(' + withoutFinal + ')';
  return (ch - 0xac00) % 28 ? withFinal : withoutFinal;
}

function setStatus(msg, tone = '') {
  const el = $('#wall-status');
  if (!el) return;
  el.textContent = msg;
  el.dataset.tone = tone;
}

function myNick() {
  const typed = ($('#wall-nick')?.value || '').trim();
  let saved = '';
  try { saved = localStorage.getItem(NICK_KEY) || ''; } catch { /* noop */ }
  const nick = (typed || saved).normalize('NFC').slice(0, MAX_NICK);
  return nick && filterContent(nick).ok ? nick : '익명 여행자';
}

function eventText(d) {
  const nick = `<b>${esc(d.nickname || '익명')}</b>`;
  const place = `<b>${esc(d.place || '')}</b>`;
  if (d.type === 'arrival') return { emoji: '🚉', html: `${nick}님이 ${place}에 도착했어요` };
  if (d.type === 'summit')  return { emoji: '⛰️', html: `${nick}님이 ${place} 정상에 올랐어요` };
  return null;
}

// 실시간 구독
function subscribe() {
  if (!db) return;
  db.collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(LIST_LIMIT)
    .onSnapshot(
      (snap) => { lastSnap = snap; renderList(snap); },
      () => {
        const list = $('#wall-list');
        if (list) list.innerHTML = '<li class="wall-empty">응원 게시판을 잠시 불러올 수 없어요. 조금 뒤 다시 시도해 주세요.</li>';
        setStatus('게시판 연결이 원활하지 않아요.', 'warn');
      },
    );
}

function renderList(snap) {
  const list = $('#wall-list');
  const countEl = $('#wall-count');
  if (!list) return;

  if (snap.empty) {
    list.innerHTML = '<li class="wall-empty">아직 응원이 없어요. 첫 한 줄을 남겨보세요 ✍️</li>';
    if (countEl) countEl.textContent = '0';
    renderLive(null);
    return;
  }
  if (countEl) countEl.textContent = String(snap.size);

  const rows = [];
  let latestEvent = null;
  snap.forEach((doc) => {
    const d = doc.data();
    const when = d.createdAt?.toDate ? d.createdAt.toDate() : null;
    const mine = uid && d.uid === uid;
    const likes = Number(d.likes) || 0;
    const didLike = liked.has(doc.id);
    const likeBtn = `<button class="wall-like${didLike ? ' is-on' : ''}" type="button" data-like="${doc.id}"
      aria-pressed="${didLike}" aria-label="공감 ${likes}개">${didLike ? '❤️' : '🤍'} <span>${likes}</span></button>`;
    const del = mine ? `<button class="wall-del" type="button" data-del="${doc.id}" aria-label="내 글 삭제">삭제</button>` : '';

    const ev = eventText(d);
    if (ev) {
      if (!latestEvent) latestEvent = { ev, when };
      rows.push(`
        <li class="wall-item is-event is-${d.type}">
          <div class="wall-event">
            <span class="wall-event-emoji" aria-hidden="true">${ev.emoji}</span>
            <p class="wall-event-text">${ev.html}</p>
            <span class="wall-time" data-ts="${when ? when.getTime() : ''}">${relTime(when)}</span>
          </div>
          <div class="wall-actions">${likeBtn}${del}</div>
        </li>`);
      return;
    }
    rows.push(`
      <li class="wall-item">
        <div class="wall-item-head">
          <span class="wall-nick">${esc(d.nickname || '익명')}</span>
          <span class="wall-time" data-ts="${when ? when.getTime() : ''}">${relTime(when)}</span>
        </div>
        <p class="wall-text">${esc(maskSensitive(d.text || ''))}</p>
        <div class="wall-actions">${likeBtn}${del}</div>
      </li>`);
  });
  list.innerHTML = rows.join('');
  renderLive(latestEvent);
}

function renderLive(latest) {
  const el = $('#wall-live');
  if (!el) return;
  if (!latest) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span class="live-dot" aria-hidden="true"></span><span class="wall-live-label">LIVE</span>
    <span>${latest.ev.emoji} ${latest.ev.html}</span><span class="wall-time">${relTime(latest.when)}</span>`;
  window.dispatchEvent(new CustomEvent('mousekm:wall-latest', { detail: { html: `${latest.ev.emoji} ${latest.ev.html}`, when: latest.when } }));
}

// "3분 전" 같은 상대 시간을 주기적으로 갱신
function refreshTimes() {
  document.querySelectorAll('#wall-list .wall-time[data-ts]').forEach((el) => {
    const ts = Number(el.dataset.ts);
    el.textContent = relTime(ts ? new Date(ts) : null);
  });
}

async function like(id, btn) {
  if (!db || !id || liked.has(id)) return;
  liked.add(id);                                   // 중복 공감 방지 (먼저 표시해 연타 막기)
  btn.classList.add('is-on');
  btn.setAttribute('aria-pressed', 'true');
  const n = btn.querySelector('span');
  if (n) n.textContent = String((Number(n.textContent) || 0) + 1);
  btn.firstChild.textContent = '❤️ ';
  try {
    await db.collection(COLLECTION).doc(id).update({ likes: FieldValue.increment(1) });
  } catch { /* 규칙 거부 등 — 표시는 다음 스냅샷에서 바로잡힌다 */ }
}

async function submit() {
  const nickEl = $('#wall-nick');
  const textEl = $('#wall-text');
  const nick = (nickEl.value || '').normalize('NFC').trim().slice(0, MAX_NICK) || '익명';
  const text = (textEl.value || '').normalize('NFC').trim();

  if (!text) { setStatus('한 줄 메시지를 입력해 주세요.', 'warn'); textEl.focus(); return; }
  if (text.length > MAX_TEXT) { setStatus(`메시지는 ${MAX_TEXT}자 이내로 남겨주세요.`, 'warn'); return; }

  // 콘텐츠 필터 — 욕설·광고·개인정보 차단 (닉네임+메시지)
  const check = filterContent(`${nick} ${text}`);
  if (!check.ok) { setStatus(check.reason, 'warn'); return; }

  if (!db) { setStatus('아직 준비 중이에요. 잠시 후 다시 시도해 주세요.', 'warn'); return; }

  const last = Number(localStorage.getItem(LAST_POST_KEY) || 0);
  if (Date.now() - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
    setStatus(`잠시 후 다시 남겨주세요 (${wait}초)`, 'warn');
    return;
  }

  const btn = $('#wall-submit');
  btn.disabled = true;
  try {
    const doc = {
      type: 'msg', nickname: nick, text, likes: 0,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (uid) doc.uid = uid;   // 익명 로그인 시에만 소유권 기록 (본인 글 삭제용)
    await db.collection(COLLECTION).add(doc);
    localStorage.setItem(NICK_KEY, nick);
    localStorage.setItem(LAST_POST_KEY, String(Date.now()));
    localStorage.setItem(POSTED_KEY, '1');
    textEl.value = '';
    updateCounter();
    setStatus('응원을 남겼어요. 고마워요! 🙌', 'ok');
    window.dispatchEvent(new CustomEvent('mousekm:posted'));
  } catch {
    setStatus('전송에 실패했어요. 잠시 후 다시 시도해 주세요.', 'warn');
  } finally {
    btn.disabled = false;
  }
}

async function removeMessage(id) {
  if (!db || !id) return;
  try {
    await db.collection(COLLECTION).doc(id).delete();
    setStatus('글을 삭제했어요.', 'ok');
  } catch {
    setStatus('삭제에 실패했어요.', 'warn');
  }
}

function updateCounter() {
  const textEl = $('#wall-text');
  const counter = $('#wall-counter');
  if (textEl && counter) counter.textContent = `${textEl.value.length}/${MAX_TEXT}`;
}

export function isAutoShare() {
  try { return localStorage.getItem(AUTOSHARE_KEY) === '1'; } catch { return false; }
}

// 도착/완등 소식을 게시판에 공유 — 자유 텍스트 없이 도시·산 이름만 보낸다(규칙이 목록으로 검증)
// 반환: 'ok' | 'dup' | 'cooldown' | 'fail'
export async function shareMilestone(type, place) {
  if (!['arrival', 'summit'].includes(type) || !place) return 'fail';
  const dedupeKey = `${type}:${place}`;
  if (shared.has(dedupeKey)) return 'dup';
  let last = 0;
  try { last = Number(localStorage.getItem(LAST_EVENT_KEY) || 0); } catch { /* noop */ }
  if (Date.now() - last < EVENT_COOLDOWN_MS) return 'cooldown';
  try {
    if (!db) await connect();
    const doc = { type, nickname: myNick(), place, likes: 0, createdAt: FieldValue.serverTimestamp() };
    if (uid) doc.uid = uid;
    await db.collection(COLLECTION).add(doc);
    shared.add(dedupeKey);
    localStorage.setItem(LAST_EVENT_KEY, String(Date.now()));
    return 'ok';
  } catch {
    return 'fail';
  }
}

export function hasPosted() {
  try { return localStorage.getItem(POSTED_KEY) === '1'; } catch { return false; }
}

let connecting = null;
function connect() {
  if (connecting) return connecting;
  connecting = getFirebase().then((fb) => {
    db = fb.db; uid = fb.uid; FieldValue = fb.FieldValue;
    return fb;
  });
  return connecting;
}

// 진입점 — index.html이 로드된 뒤 호출
export async function initWall() {
  const form = $('#wall-form');
  if (!form) return;

  // 저장된 닉네임 복원
  const savedNick = localStorage.getItem(NICK_KEY);
  if (savedNick && $('#wall-nick')) $('#wall-nick').value = savedNick;

  $('#wall-text')?.addEventListener('input', updateCounter);
  updateCounter();
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

  // 자동 공유 설정
  const auto = $('#wall-autoshare');
  if (auto) {
    auto.checked = isAutoShare();
    auto.addEventListener('change', () => {
      try { localStorage.setItem(AUTOSHARE_KEY, auto.checked ? '1' : '0'); } catch { /* noop */ }
    });
  }

  // 공감·삭제는 목록에 한 번만 위임
  $('#wall-list')?.addEventListener('click', (e) => {
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) { like(likeBtn.dataset.like, likeBtn); return; }
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) removeMessage(delBtn.dataset.del);
  });

  setInterval(refreshTimes, 30_000);

  setStatus('불러오는 중…');
  try {
    await connect();
    subscribe();
    setStatus('한 줄 응원을 남겨보세요.');
  } catch {
    setStatus('커뮤니티를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.', 'warn');
  }
}
