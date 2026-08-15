// mousekm 플레이리스트 — 손끝 여행 BGM
// 레퍼런스: Shutress(bbusyeo) 플레이리스트 — PULSE ORIGIN 69% 우선 랜덤 재생.
// 측정을 시작하면 음악이 자동으로 재생되고, 곡이 끝나면 다음 곡으로 넘어간다.

const YT_ORIGIN = 'https://www.youtube.com';

/* PULSE ORIGIN(@PULSEORIGN) 추천 — 서버 함수가 최신 목록을 주면 교체된다 */
let PULSE_TRACKS = [
  { id: '9E40d1donW4', label: '분위기 좋은 편집샵 재즈 힙합 🎷' },
  { id: 'N7XS4HasGk4', label: 'Late Night Jazz Hip Hop ☕' },
  { id: '-cZkpBoJ-1c', label: '마음이 조용해지는 인디 락' },
  { id: 'bAQlnYFfscE', label: 'Smooth R&B & Soul Mix' },
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

let frame, input, errorEl, started = false, lastAdvance = 0;

/* 유튜브 URL 파싱 — 영상/짧은주소/플레이리스트 모두 지원 */
export function parseYouTube(url) {
  try {
    const u = new URL(String(url).trim());
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return null;
    const list = u.searchParams.get('list');
    if (list) return { type: 'list', id: list };
    if (u.hostname.includes('youtu.be')) return { type: 'video', id: u.pathname.slice(1).split('/')[0] };
    if (u.pathname === '/watch') return { type: 'video', id: u.searchParams.get('v') };
    const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{6,})/);
    if (m) return { type: 'video', id: m[2] };
  } catch { /* URL 형식 아님 */ }
  return null;
}

function ytSrc(id, autoplay) {
  const origin = encodeURIComponent(window.location.origin);
  return `${YT_ORIGIN}/embed/${id}?rel=0&enablejsapi=1&origin=${origin}` + (autoplay ? '&autoplay=1' : '');
}

/* 트랙 로드마다 listening 등록 — 이래야 재생 상태변화(종료) 이벤트가 온다 */
function ytRegister() {
  try {
    frame.contentWindow.postMessage(
      JSON.stringify({ event: 'listening', id: 'mousekm-yt', channel: 'widget' }), YT_ORIGIN);
  } catch { /* 아직 로드 전 */ }
}

function markActiveChip(id) {
  $$('.pl-preset').forEach((p) => p.classList.toggle('is-on', p.dataset.id === id));
}

function playTrack(t, source) {
  frame.src = ytSrc(t.id, started);
  errorEl.hidden = true;
  $('#pl-now').innerHTML = `지금 재생 · <b>${t.label}</b>` +
    (source === 'pulse' ? ' <span class="pl-badge">PULSEORIGN</span>' : '');
  markActiveChip(t.id);
}

/* 자동/셔플: 69% 확률로 PULSE ORIGIN 우선 */
function shufflePlay() {
  const usePulse = Math.random() < 0.69;
  const pool = usePulse ? PULSE_TRACKS : MUSIC_POOL;
  playTrack(rand(pool), usePulse ? 'pulse' : 'pool');
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
  if (!parsed || !parsed.id) { errorEl.hidden = false; return false; }
  errorEl.hidden = true;
  started = true;                       // 사용자가 직접 재생 — 이후 자동재생 유지
  const origin = encodeURIComponent(window.location.origin);
  frame.src = parsed.type === 'list'
    ? `${YT_ORIGIN}/embed/videoseries?list=${parsed.id}&rel=0&autoplay=1&enablejsapi=1&origin=${origin}`
    : ytSrc(parsed.id, true);
  $('#pl-now').innerHTML = '지금 재생 · <b>내가 붙여넣은 링크</b>';
  markActiveChip('');
  return true;
}

const musicIcon = '<svg class="pl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

function renderPresets() {
  const box = $('#pl-presets');
  if (!box) return;
  box.innerHTML = PULSE_TRACKS
    .map((t) => `<button class="pl-preset" type="button" data-id="${t.id}">${musicIcon}<span>${t.label}</span></button>`)
    .join('');
  const cur = frame.getAttribute('src') || '';
  markActiveChip((PULSE_TRACKS.find((t) => cur.includes(t.id)) || {}).id || '');
}

/* 측정 시작 등으로 음악을 자동 시작 (한 번만) */
export function ensureMusic() {
  if (started) return;
  started = true;
  const cur = frame?.getAttribute('src') || '';
  const t = [...PULSE_TRACKS, ...MUSIC_POOL].find((x) => cur.includes(x.id));
  if (t) frame.src = ytSrc(t.id, true);   // 이미 고른 곡이 있으면 그대로 재생
  else shufflePlay();
}

export function initPlaylist() {
  frame   = $('#pl-frame');
  input   = $('#pl-input');
  errorEl = $('#pl-error');
  if (!frame) return;

  frame.addEventListener('load', () => { ytRegister(); setTimeout(ytRegister, 600); });

  /* YouTube IFrame API 메시지 수신 — onReady 시 볼륨 50%, 곡 종료 시 다음 곡 */
  window.addEventListener('message', (e) => {
    if (e.origin !== YT_ORIGIN) return;
    let d;
    try { d = JSON.parse(e.data); } catch { return; }
    if (d.event === 'onReady' && frame.contentWindow) {
      frame.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'setVolume', args: [50] }), YT_ORIGIN);
    }
    const ps = d.event === 'onStateChange' ? d.info
      : (d.event === 'infoDelivery' && d.info && typeof d.info.playerState === 'number') ? d.info.playerState
      : null;
    if (ps === 0) nextTrack();
  });

  $('#pl-play')?.addEventListener('click', () => playCustom(input.value));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); playCustom(input.value); }
  });
  $('#pl-shuffle')?.addEventListener('click', () => { started = true; shufflePlay(); });

  document.addEventListener('click', (e) => {
    const chip = e.target.closest?.('.pl-preset');
    if (!chip) return;
    const t = PULSE_TRACKS.find((x) => x.id === chip.dataset.id);
    if (t) { started = true; playTrack(t, 'pulse'); }
  });

  renderPresets();
  // 첫 곡은 미리 걸어두되 자동재생은 하지 않는다 (사용자 조작 전 소리 없음)
  const first = rand(PULSE_TRACKS);
  frame.src = ytSrc(first.id, false);
  $('#pl-now').innerHTML = `<b>${first.label}</b> — 측정을 시작하면 자동으로 재생돼요`;
  markActiveChip(first.id);

  /* PULSE ORIGIN 채널의 최신 업로드로 목록 최신화 (실패 시 폴백 유지) */
  (async () => {
    try {
      const res = await fetch('/.netlify/functions/pulse-tracks', { cache: 'no-store' });
      if (!res.ok) return;
      const list = await res.json();
      if (Array.isArray(list) && list.length >= 3) { PULSE_TRACKS = list; renderPresets(); }
    } catch { /* 로컬·오프라인 등 — 폴백 목록 유지 */ }
  })();
}
