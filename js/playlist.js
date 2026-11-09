// mousekm 플레이리스트 — 손끝 여행 BGM
// 레퍼런스: Shutress(bbusyeo) 플레이리스트 — PULSE ORIGIN 69% 우선 랜덤 재생.
// 측정을 시작하면 음악이 자동으로 재생되고, 곡이 끝나거나 재생 불가면 다음 곡으로 넘어간다.

const YT_ORIGIN = 'https://www.youtube.com';
const ID_RE = /^[\w-]{6,64}$/;

/* 최신 목록을 못 받았을 때만 쓰는 내장 목록 (임베드 가능 여부 확인한 곡만) */
let PULSE_TRACKS = [
  { id: '9E40d1donW4', label: '분위기 좋은 편집샵 재즈 힙합 🎷' },
  { id: 'N7XS4HasGk4', label: 'Late Night Jazz Hip Hop ☕' },
  { id: '-cZkpBoJ-1c', label: '마음이 조용해지는 인디 락' },
  { id: 'uVDR99PBFlg', label: '위험하게 분위기 좋은 둠칫 플리' },
  { id: 'G5PYccAFx3A', label: '걷다가 기분 좋아지는 도시팝 🚦' },
  { id: '4VZ6qgjB7jk', label: '연휴 필수 드라이브 팝 🚗' },
  { id: 'lH1YXw5oVk0', label: 'J-Rock for Late Night Drives' },
  { id: 'cMvrfbSdKwE', label: 'Stop Overthinking 🌙' },
  { id: 'AalYJfNXelk', label: '혼자 들으면 위험한 R&B 🔥' },
  { id: 'eUTnOGMh-v0', label: '위험하게 끌리는 Toxic R&B' },
];

/* 일반 음악 풀 (31% 확률) — 셔플용으로만 내부 유지 */
const MUSIC_POOL = [
  { id: 'jfKfPfyJRdk', label: 'lofi 집중 라디오 (라이브)' },
  { id: '5qap5aO4i9A', label: 'lofi hip hop radio' },
  { id: 'rUxyKA_-grg', label: '집중이 잘 되는 피아노' },
];

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

let frame, input, errorEl;
let started = false;      // 사용자가 재생을 시작했는지 (그 전에는 유튜브 플레이어를 아예 불러오지 않음)
let idleTrack = null;     // 재생 전 대기 곡
let lastAdvance = 0;

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 유튜브 제목은 한글이 풀어쓴 자모(NFD)로 오기도 해서, 잘린 자리에 'ᄀ' 같은 조각이 남는다
function cleanLabel(label) {
  let s = String(label || '').normalize('NFC');
  s = s.replace(/[ᄀ-ᇿ㄰-㆏]+…$/, '…');
  return s;
}

function sanitizeList(list) {
  if (!Array.isArray(list)) return null;
  const valid = list
    .filter((t) => t && typeof t.id === 'string' && ID_RE.test(t.id) && typeof t.label === 'string')
    .map((t) => ({ id: t.id, label: cleanLabel(t.label) }));
  return valid.length >= 3 ? valid : null;
}

/* 유튜브 URL 파싱 — 영상/짧은주소/플레이리스트/쇼츠 지원 (id 형식까지 검증) */
export function parseYouTube(url) {
  try {
    const u = new URL(String(url).trim());
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return null;
    let out = null;
    const list = u.searchParams.get('list');
    if (list) out = { type: 'list', id: list };
    else if (u.hostname.includes('youtu.be')) out = { type: 'video', id: u.pathname.slice(1).split('/')[0] };
    else if (u.pathname === '/watch') out = { type: 'video', id: u.searchParams.get('v') };
    else {
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{6,})/);
      if (m) out = { type: 'video', id: m[2] };
    }
    return out && ID_RE.test(out.id || '') ? out : null;
  } catch { /* URL 형식 아님 */ }
  return null;
}

function ytSrc(id, autoplay) {
  const origin = encodeURIComponent(window.location.origin);
  return `${YT_ORIGIN}/embed/${encodeURIComponent(id)}?rel=0&enablejsapi=1&origin=${origin}` + (autoplay ? '&autoplay=1' : '');
}

/* 트랙 로드마다 listening 등록 — 이래야 재생 상태변화(종료·오류) 이벤트가 온다 */
function ytRegister() {
  try {
    frame.contentWindow.postMessage(
      JSON.stringify({ event: 'listening', id: 'mousekm-yt', channel: 'widget' }), YT_ORIGIN);
  } catch { /* 아직 로드 전 */ }
}

function markActiveChip(id) {
  $$('.pl-preset').forEach((p) => p.classList.toggle('is-on', p.dataset.id === id));
}

function showFacade(show) {
  const facade = $('#pl-facade');
  if (facade) facade.hidden = !show;
  frame.style.visibility = show ? 'hidden' : 'visible';
}

function setIdle(t) {
  if (started || !t) return;
  idleTrack = t;
  const thumb = $('#pl-thumb');
  if (thumb) thumb.src = `https://i.ytimg.com/vi/${encodeURIComponent(t.id)}/hqdefault.jpg`;
  $('#pl-now').innerHTML = `<b>${esc(t.label)}</b> — 측정을 시작하거나 ▶를 누르면 재생돼요`;
  markActiveChip(t.id);
  showFacade(true);
}

function markDj() {
  try { localStorage.setItem('mousekm.dj', '1'); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent('mousekm:dj'));
}

function playTrack(t, source) {
  started = true;
  frame.src = ytSrc(t.id, true);
  showFacade(false);
  errorEl.hidden = true;
  $('#pl-now').innerHTML = `지금 재생 · <b>${esc(t.label)}</b>` +
    (source === 'pulse' ? ' <span class="pl-badge">PULSEORIGN</span>' : '');
  markActiveChip(t.id);
}

/* 자동/셔플: 69% 확률로 PULSE ORIGIN 우선 (방금 곡은 피한다) */
function shufflePlay() {
  const usePulse = Math.random() < 0.69;
  const pool = usePulse ? PULSE_TRACKS : MUSIC_POOL;
  const cur = frame.getAttribute('src') || '';
  const candidates = pool.filter((t) => !cur.includes(t.id));
  playTrack(rand(candidates.length ? candidates : pool), usePulse ? 'pulse' : 'pool');
}

/* 현재 곡 다음으로 자동 전환 (PULSE_TRACKS 순환, 그 외엔 셔플). 종료 이벤트 중복 방지 */
function nextTrack() {
  const now = Date.now();
  if (now - lastAdvance < 3000) return;
  lastAdvance = now;
  const cur = frame.getAttribute('src') || '';
  const idx = PULSE_TRACKS.findIndex((t) => cur.includes(t.id));
  if (idx >= 0) playTrack(PULSE_TRACKS[(idx + 1) % PULSE_TRACKS.length], 'pulse');
  else shufflePlay();
}

function playCustom(url) {
  const parsed = parseYouTube(url);
  if (!parsed) { errorEl.hidden = false; return false; }
  errorEl.hidden = true;
  started = true;
  const origin = encodeURIComponent(window.location.origin);
  frame.src = parsed.type === 'list'
    ? `${YT_ORIGIN}/embed/videoseries?list=${encodeURIComponent(parsed.id)}&rel=0&autoplay=1&enablejsapi=1&origin=${origin}`
    : ytSrc(parsed.id, true);
  showFacade(false);
  $('#pl-now').innerHTML = '지금 재생 · <b>내가 붙여넣은 링크</b>';
  markActiveChip('');
  markDj();
  return true;
}

const musicIcon = '<svg class="pl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

function renderPresets() {
  const box = $('#pl-presets');
  if (!box) return;
  box.innerHTML = PULSE_TRACKS
    .map((t, i) => `<button class="pl-preset" type="button" data-id="${esc(t.id)}">${musicIcon}<span>${esc(t.label)}</span>${i === 0 ? '<em class="pl-new">NEW</em>' : ''}</button>`)
    .join('');
  const cur = frame.getAttribute('src') || '';
  markActiveChip((PULSE_TRACKS.find((t) => cur.includes(t.id)) || idleTrack || {}).id || '');
}

/* 측정 시작 등으로 음악을 자동 시작 (한 번만) */
export function ensureMusic() {
  if (started || !frame) return;
  if (idleTrack) playTrack(idleTrack, 'pulse');
  else shufflePlay();
}

/* 최신 롱폼 목록: 1순위 Pages 함수 /api(채널 /videos 탭), 2순위 data/pulse-tracks.json */
async function loadLatest() {
  for (const url of ['/api/pulse-tracks', 'data/pulse-tracks.json']) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const valid = sanitizeList(await res.json());
      if (valid) return valid;
    } catch { /* 다음 소스로 */ }
  }
  return null;
}

export function initPlaylist() {
  frame   = $('#pl-frame');
  input   = $('#pl-input');
  errorEl = $('#pl-error');
  if (!frame) return;

  frame.addEventListener('load', () => { ytRegister(); setTimeout(ytRegister, 600); });

  /* YouTube IFrame API 메시지 — onReady 시 볼륨 50%, 종료(0)나 재생 불가 오류면 다음 곡 */
  window.addEventListener('message', (e) => {
    if (e.origin !== YT_ORIGIN) return;
    let d;
    try { d = JSON.parse(e.data); } catch { return; }
    if (d.event === 'onReady' && frame.contentWindow) {
      frame.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'setVolume', args: [50] }), YT_ORIGIN);
    }
    if (d.event === 'onError') { nextTrack(); return; }   // 삭제·임베드 금지 영상 건너뛰기
    const ps = d.event === 'onStateChange' ? d.info
      : (d.event === 'infoDelivery' && d.info && typeof d.info.playerState === 'number') ? d.info.playerState
      : null;
    if (ps === 0) nextTrack();
  });

  $('#pl-play')?.addEventListener('click', () => playCustom(input.value));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); playCustom(input.value); }
  });
  $('#pl-shuffle')?.addEventListener('click', () => { shufflePlay(); markDj(); });
  $('#pl-facade')?.addEventListener('click', () => {
    if (idleTrack) playTrack(idleTrack, 'pulse'); else shufflePlay();
  });

  $('#pl-presets')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.pl-preset');
    if (!chip) return;
    const t = PULSE_TRACKS.find((x) => x.id === chip.dataset.id);
    if (t) { playTrack(t, 'pulse'); markDj(); }
  });

  // 최신 목록을 잠깐 기다렸다가 그리고(오래된 내장 목록이 번쩍 보이지 않게), 늦게 오면 그때 교체
  let settled = false;
  const fallback = setTimeout(() => {
    if (settled) return;
    renderPresets();
    setIdle(PULSE_TRACKS[0]);
  }, 2500);
  loadLatest().then((latest) => {
    settled = true;
    clearTimeout(fallback);
    if (latest) PULSE_TRACKS = latest;
    renderPresets();
    if (!started) setIdle(PULSE_TRACKS[0]);   // 가장 최근에 올라온 곡을 대기 곡으로
  });
}
