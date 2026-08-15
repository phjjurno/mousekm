// 손끝 응원 방명록 — 익명 한 줄 메시지 (Firebase 재사용: wsqf-44950)
// 개인정보 원칙 유지: 닉네임과 사용자가 직접 입력한 한 줄 메시지 외에는 저장하지 않는다.
// 측정 데이터(키/마우스 내용)와는 완전히 분리되며, 이 방명록은 사용자가 명시적으로 남긴 글만 다룬다.

const FB_CONFIG = {
  apiKey: 'AIzaSyDeS2DReru5lct240dtQCR3tDGGvSrRRJg',
  authDomain: 'wsqf-44950.firebaseapp.com',
  projectId: 'wsqf-44950',
  storageBucket: 'wsqf-44950.firebasestorage.app',
  messagingSenderId: '1008642348586',
  appId: '1:1008642348586:web:ed068034113a8fa8b35553',
};

const COLLECTION   = 'mousekm_wall';
const MAX_NICK      = 12;
const MAX_TEXT      = 100;
const LIST_LIMIT    = 50;
const COOLDOWN_MS   = 20_000;
const NICK_KEY      = 'mousekm.wall.nick';
const LAST_POST_KEY = 'mousekm.wall.lastPost';

let db = null;
let uid = null;
let ready = false;

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

// 반환: { ok: true } 또는 { ok: false, reason }
function filterContent(text) {
  const t = (text || '').trim();
  for (const re of PII_PATTERNS) {
    if (re.test(t)) return { ok: false, reason: '전화번호·이메일·계좌 등 개인정보가 포함된 글은 남길 수 없어요.' };
  }
  for (const re of AD_PATTERNS) {
    if (re.test(t)) return { ok: false, reason: '링크·광고·홍보성 문구는 남길 수 없어요.' };
  }
  const norm = t.toLowerCase().replace(/[\s._\-*~^ㅤ]/g, '');
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

function setStatus(msg, tone = '') {
  const el = $('#wall-status');
  if (!el) return;
  el.textContent = msg;
  el.dataset.tone = tone;
}

// Firebase 초기화 + 익명 로그인 (실패해도 읽기는 계속 시도)
async function init() {
  if (typeof firebase === 'undefined' || !firebase.firestore) {
    setStatus('커뮤니티를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.', 'warn');
    return false;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
    db = firebase.firestore();
  } catch {
    setStatus('커뮤니티를 불러오지 못했습니다.', 'warn');
    return false;
  }

  // 익명 로그인이 켜져 있으면 uid로 소유권을 확보해 '내 글 삭제'까지 가능해진다.
  // 꺼져 있어도 규칙이 비로그인 작성을 허용하므로 글쓰기는 계속 동작한다.
  try {
    const cred = await firebase.auth().signInAnonymously();
    uid = cred.user?.uid || null;
  } catch {
    uid = null; // 익명 로그인 미활성 — 비로그인 모드로 작성
  }
  ready = true;
  return true;
}

// 실시간 구독
function subscribe() {
  if (!db) return;
  db.collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(LIST_LIMIT)
    .onSnapshot(
      (snap) => renderList(snap),
      () => {
        // 규칙 미배포/권한 등 — 목록을 안내 상태로 되돌린다
        const list = $('#wall-list');
        if (list) list.innerHTML = '<li class="wall-empty">응원 게시판을 준비하고 있어요. 곧 열립니다 🙌</li>';
        setStatus('게시판 오픈 준비 중입니다.', 'warn');
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
    return;
  }
  if (countEl) countEl.textContent = String(snap.size);

  const rows = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const when = d.createdAt?.toDate ? d.createdAt.toDate() : null;
    const mine = uid && d.uid === uid;
    rows.push(`
      <li class="wall-item">
        <div class="wall-item-head">
          <span class="wall-nick">${esc(d.nickname || '익명')}</span>
          <span class="wall-time">${relTime(when)}</span>
        </div>
        <p class="wall-text">${esc(maskSensitive(d.text || ''))}</p>
        ${mine ? `<button class="wall-del" data-del="${doc.id}" aria-label="내 메시지 삭제">삭제</button>` : ''}
      </li>`);
  });
  list.innerHTML = rows.join('');

  list.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => removeMessage(btn.dataset.del));
  });
}

async function submit() {
  const nickEl = $('#wall-nick');
  const textEl = $('#wall-text');
  const nick = (nickEl.value || '').trim().slice(0, MAX_NICK) || '익명';
  const text = (textEl.value || '').trim();

  if (!text) { setStatus('한 줄 메시지를 입력해 주세요.', 'warn'); textEl.focus(); return; }
  if (text.length > MAX_TEXT) { setStatus(`메시지는 ${MAX_TEXT}자 이내로 남겨주세요.`, 'warn'); return; }

  // 콘텐츠 필터 — 욕설·광고·개인정보 차단 (닉네임+메시지)
  const check = filterContent(`${nick} ${text}`);
  if (!check.ok) { setStatus(check.reason, 'warn'); return; }

  if (!ready || !db) {
    setStatus('아직 준비 중이에요. 잠시 후 다시 시도해 주세요.', 'warn');
    return;
  }

  const last = Number(localStorage.getItem(LAST_POST_KEY) || 0);
  if (Date.now() - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
    setStatus(`잠시 후 다시 남겨주세요 (${wait}초)`, 'warn');
    return;
  }

  const btn = $('#wall-submit');
  btn.disabled = true;
  try {
    const doc = { nickname: nick, text, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (uid) doc.uid = uid;   // 익명 로그인 시에만 소유권 기록 (본인 글 삭제용)
    await db.collection(COLLECTION).add(doc);
    localStorage.setItem(NICK_KEY, nick);
    localStorage.setItem(LAST_POST_KEY, String(Date.now()));
    textEl.value = '';
    updateCounter();
    setStatus('응원을 남겼어요. 고마워요! 🙌', 'ok');
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
    setStatus('메시지를 삭제했어요.', 'ok');
  } catch {
    setStatus('삭제에 실패했어요.', 'warn');
  }
}

function updateCounter() {
  const textEl = $('#wall-text');
  const counter = $('#wall-counter');
  if (textEl && counter) counter.textContent = `${textEl.value.length}/${MAX_TEXT}`;
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

  setStatus('불러오는 중…');
  const ok = await init();
  if (ok) {
    subscribe();
    setStatus('한 줄 응원을 남겨보세요.');
  }
}
