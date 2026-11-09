// mousekm 메인 — 측정 엔진과 UI를 연결한다
import { TRACKING } from './config.js?v=10';
import { ARRIVAL_MESSAGES } from './routes.js?v=10';
import { createTracker, STATUS } from './tracker.js?v=10';
import { getJourney } from './journey.js?v=10';
import { generateTitle } from './titleGenerator.js?v=10';
import { loadThisWeek, loadPastTotals, invalidatePastTotals, loadActiveDayKeys } from './storage.js?v=10';
import { drawResultCard, downloadCard, pickShareLine } from './resultCard.js?v=10';
import {
  loadDisplay, saveDisplay, pxPerKm, conversionHint,
  detectMonitors, isMultiScreen, defaultMonitor, MONITOR_INCHES, MAX_MONITORS,
} from './display.js?v=10';
import { stairsInfo, fmtHeight, MOUNTAINS } from './stairs.js?v=10';
import { initWall, shareMilestone, isAutoShare, hasPosted, filterContent } from './wall.js?v=10';
import { initPlaylist, ensureMusic } from './playlist.js?v=10';
import { initCommunity, contributeNow } from './community.js?v=10';
import { evaluateBadges, computeStreak, BADGES } from './achievements.js?v=10';
import {
  buildChallengeUrl, readChallengeFromUrl, clearChallengeFromUrl, saveTarget, loadTarget,
  markTargetWon, clearTarget, shareChallenge, hasShared, hasWon,
} from './challenge.js?v=10';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const NICK_KEY = 'mousekm.wall.nick';

const tracker = createTracker();
let display  = loadDisplay();
let kmRate   = pxPerKm(display);
let lastArrivedCount = null;   // null = 아직 기준값 없음(첫 렌더에서 알림 없이 기준만 잡는다)
let lastClimbedCount = null;

// ── 포맷 헬퍼 ──
const fmtInt  = (n) => Math.round(n).toLocaleString();
const toKm    = (px) => px / kmRate;
function fmtDist(km) {
  if (km >= 10)    return `${km.toFixed(1)}km`;
  if (km >= 1)     return `${km.toFixed(2)}km`;
  if (km >= 0.001) return `${Math.round(km * 1000)}m`;
  return `${Math.round(km * 100_000)}cm`;
}
function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}
// 받침에 맞는 조사 (구리를 / 강릉을)
function eulReul(word) {
  const ch = String(word).slice(-1).charCodeAt(0);
  if (ch < 0xac00 || ch > 0xd7a3) return '을(를)';
  return (ch - 0xac00) % 28 ? '을' : '를';
}
function savedNick() {
  try {
    const n = (localStorage.getItem(NICK_KEY) || '').trim();
    return n && filterContent(n).ok ? n : '';
  } catch { return ''; }
}

// ── 토스트 (선택적으로 버튼 하나) ──
let toastTimer = null;
function toast(msg, action) {
  const el = $('#toast');
  const text = $('#toast-msg');
  const btn = $('#toast-action');
  text.textContent = msg;
  if (action) {
    btn.textContent = action.label;
    btn.hidden = false;
    btn.onclick = () => { el.classList.remove('show'); action.onClick(); };
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
  el.classList.toggle('has-action', !!action);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 8000 : 4000);
}

// ── 모달 ──
function cleanupEmbed() { const f = $('#embed-frame'); if (f) f.src = 'about:blank'; }
function openModal(id) { $(id).classList.add('open'); }
function closeModal(el) {
  const bg = el.closest('.modal-backdrop');
  bg.classList.remove('open');
  if (bg.id === 'modal-embed') cleanupEmbed();
}
$$('.modal-backdrop').forEach((bg) => {
  bg.addEventListener('click', (e) => {
    if (e.target !== bg) return;
    bg.classList.remove('open');
    if (bg.id === 'modal-embed') cleanupEmbed();
  });
});
$$('[data-close]').forEach((btn) => btn.addEventListener('click', () => closeModal(btn)));
// ESC로 맨 위 모달 닫기 (예전엔 키보드로 닫을 방법이 없었음)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = [...$$('.modal-backdrop.open')].pop();
  if (open) closeModal(open.firstElementChild || open);
});

// ── 상태 표시 ──
function statusLabel() {
  if (tracker.status === STATUS.RECORDING) return ['● 기록 중', 'rec'];
  if (tracker.status === STATUS.PAUSED)    return ['Ⅱ 일시정지', 'pause'];
  return ['○ 기록 안 함', 'off'];
}
function updateControls() {
  const recording = tracker.status === STATUS.RECORDING;
  const off       = tracker.status === STATUS.OFF;
  $('#btn-toggle').textContent    = off ? '측정 시작' : recording ? '일시정지' : '측정 재개';
  $('#widget-toggle').textContent = off ? '시작' : recording ? '일시정지' : '재개';
  const [label, cls] = statusLabel();
  $$('.status-badge').forEach((el) => {
    el.textContent    = label;
    el.dataset.state  = cls;
  });
  const embedRec = $('#embed-rec');
  if (embedRec) {
    embedRec.textContent  = recording ? '● 측정 중' : off ? '○ 대기' : 'Ⅱ 일시정지';
    embedRec.dataset.state = recording ? 'rec' : off ? 'off' : 'pause';
  }
}

// ── 도착·완등 소식 공유 ──
async function announceMilestone(type, place, message) {
  if (isAutoShare()) {
    const r = await shareMilestone(type, place);
    toast(r === 'ok' ? `${message}\n게시판에도 소식을 전했어요.` : message);
    return;
  }
  toast(message, {
    label: '게시판에 자랑하기',
    onClick: async () => {
      const r = await shareMilestone(type, place);
      const msg = { ok: '응원 게시판에 소식을 올렸어요! 🙌', dup: '이미 공유한 소식이에요.', cooldown: '잠시 후 다시 공유할 수 있어요.', fail: '공유에 실패했어요. 잠시 후 다시 시도해 주세요.' }[r];
      toast(msg);
    },
  });
}

// ── 계단·산 툴팁 업데이트 ──
function updateMountainTip(stairs) {
  const { heightM, steps, floors, climbed, next } = stairs;

  $('#stat-scroll').textContent    = floors > 0 ? `${floors.toLocaleString()}층` : `${steps}계단`;
  $('#stat-scroll-sub').textContent = `${steps.toLocaleString()}계단 · ${fmtHeight(heightM)}`;

  const summitEl = $('#stairs-summit');
  if (climbed.length > 0) {
    const last = climbed[climbed.length - 1];
    summitEl.textContent = `${last.emoji} ${last.name} 완등!`;
  } else {
    summitEl.textContent = '';
  }

  // 새 산 완등 감지 → 토스트 (첫 렌더는 기준만 잡아 새로고침마다 같은 알림이 반복되지 않게)
  if (lastClimbedCount === null) {
    lastClimbedCount = climbed.length;
  } else if (climbed.length > lastClimbedCount) {
    const newMt = climbed[climbed.length - 1];
    lastClimbedCount = climbed.length;
    announceMilestone('summit', newMt.name, `${newMt.emoji} ${newMt.name} 완등! (해발 ${newMt.height}m)\n${newMt.note}`);
  } else if (climbed.length < lastClimbedCount) {
    lastClimbedCount = climbed.length;
  }

  if (next) {
    const pct = Math.min(100, heightM / next.height * 100);
    $('#mt-emoji').textContent  = next.emoji;
    $('#mt-title').textContent  = `${next.name} 등반 중`;
    $('#mt-sub').textContent    = `${next.region} · ${next.note}`;
    $('#mt-progress-fill').style.width = `${pct.toFixed(1)}%`;
    $('#mt-pct').textContent    = `${pct.toFixed(0)}%`;
    $('#mt-target').textContent =
      `현재 ${fmtHeight(heightM)} / ${next.name} 정상 ${next.height}m · 남은 거리 ${fmtHeight(next.height - heightM)}`;
  } else {
    $('#mt-emoji').textContent  = '🌋';
    $('#mt-title').textContent  = '모든 산 완등!';
    $('#mt-sub').textContent    = '한라산 정상까지 올랐습니다';
    $('#mt-progress-fill').style.width = '100%';
    $('#mt-pct').textContent    = '100%';
    $('#mt-target').textContent = `총 ${fmtHeight(heightM)} 등반`;
  }

  const listHtml = MOUNTAINS.map((m) => {
    const done = climbed.some((c) => c.name === m.name);
    return `<span class="mt-climbed-chip${done ? ' done' : ''}" title="${m.height}m">${done ? '✓' : '○'} ${m.name}</span>`;
  }).join('');
  const listEl = $('#mt-climbed-list');
  if (listEl.dataset.sig !== String(climbed.length)) {    // 바뀔 때만 다시 그림
    listEl.innerHTML = listHtml;
    listEl.dataset.sig = String(climbed.length);
  }
}

// ── 터치 디바이스: 탭으로 툴팁 토글 ──
$('#stairs-card')?.addEventListener('click', () => {
  if (!window.matchMedia('(pointer:coarse)').matches) return;
  $('#stairs-card').classList.toggle('tip-open');
});

// 크롬 확장이 남긴 기록 — 확장 브리지가 localStorage('mousekm.ext.v1')에 기록.
// (확장은 mousekm 사이트 자체를 측정하지 않으므로 이중 합산 없음) 매 렌더 파싱을 피하려 5초 캐시.
let extCache = { at: 0, px: 0, activeKeys: [] };
function readExt() {
  if (Date.now() - extCache.at < 5000) return extCache;
  let px = 0;
  const activeKeys = [];
  try {
    const ext = JSON.parse(localStorage.getItem('mousekm.ext.v1'));
    for (const k in (ext?.days || {})) {
      const d = ext.days[k];
      const dayPx = (d.mousePx || 0) + (d.scrollPx || 0);
      px += dayPx;
      if (dayPx > 0 || (d.keys || 0) > 0) activeKeys.push(k);
    }
  } catch { /* noop */ }
  extCache = { at: Date.now(), px, activeKeys };
  return extCache;
}
const extLifetimePx = () => readExt().px;

// 누적(평생) 여행 거리 — 지난 날짜 합계(캐시) + 오늘의 실시간 상태 + 확장 기록
function lifetimeTravelKm() {
  const past = loadPastTotals(tracker.dateKey);
  const s = tracker.state;
  return toKm(past.mousePx + past.scrollPx + s.mouseDistancePixels + s.scrollDistancePixels + extLifetimePx());
}

// ── 실시간 대시보드 렌더 ──
function render() {
  const s        = tracker.state;
  const mouseKm  = toKm(s.mouseDistancePixels);
  const scrollM  = toKm(s.scrollDistancePixels) * 1000;
  const todayKm  = mouseKm + toKm(s.scrollDistancePixels);
  const travelKm = lifetimeTravelKm();

  $('#stat-keys').textContent   = `${fmtInt(s.keyCount)}타`;
  $('#stat-mouse').textContent  = fmtDist(mouseKm);
  $('#stat-clicks').textContent = `${fmtInt(s.clickCount)}회`;
  $('#stat-time').textContent   = fmtTime(s.activeSeconds);

  updateMountainTip(stairsInfo(scrollM));

  $('#widget-keys').textContent   = `⌨ ${fmtInt(s.keyCount)}`;
  $('#widget-mouse').textContent  = `🖱 ${fmtDist(mouseKm)}`;
  $('#widget-clicks').textContent = `👆 ${fmtInt(s.clickCount)}`;

  // 여행 지도 (누적 거리 기준)
  const j = getJourney(travelKm);
  $('#journey-from').textContent    = j.fromName;
  $('#journey-to').textContent      = j.finished ? '🎉 전국 완주!' : j.toName;
  $('#journey-fill').style.width    = `${(j.progress * 100).toFixed(1)}%`;
  $('#journey-pin').style.left      = `${(j.progress * 100).toFixed(1)}%`;
  $('#journey-percent').textContent = `구간 진행도 ${(j.progress * 100).toFixed(0)}%`;
  $('#journey-total').textContent   = fmtDist(travelKm);
  $('#journey-remain').textContent  = j.finished
    ? '서울역에서 인천공항까지 전국 완주!'
    : `${j.toName}까지 ${fmtDist(j.remainKm)} 남음 · 오늘 +${fmtDist(todayKm)}`;
  $('#journey-sentence').innerHTML  = j.finished
    ? '당신의 손끝이 <strong>서울역</strong>에서 출발해<br><strong>전국 시·군</strong>을 완주했습니다.'
    : `당신의 손끝은 지금<br><strong>${j.fromName}</strong>${eulReul(j.fromName)} 지나 <strong>${j.toName}</strong> 방향으로 가고 있습니다.`;

  const passedEl = $('#journey-passed');
  const passedSig = String(j.passed.length);
  if (passedEl.dataset.sig !== passedSig) {
    if (!j.passed.length) {
      passedEl.innerHTML = '<span class="chip chip-empty">아직 지나온 곳이 없어요</span>';
    } else {
      const MAX_CHIPS = 18;
      const shown  = j.passed.slice(-MAX_CHIPS);
      const hidden = j.passed.length - shown.length;
      passedEl.innerHTML =
        (hidden > 0 ? `<span class="chip chip-more">+${hidden}곳</span>` : '') +
        shown.map((c) => `<span class="chip">${c} ✓</span>`).join('');
    }
    passedEl.dataset.sig = passedSig;
  }

  // 경유지 도착 알림 (여행은 누적 기준이라 자정이 지나도 기준을 초기화하지 않는다)
  if (lastArrivedCount === null) {
    lastArrivedCount = j.passed.length;
  } else if (j.passed.length > lastArrivedCount) {
    const city = j.passed[j.passed.length - 1];
    const skipped = j.passed.length - lastArrivedCount - 1;
    const msg  = ARRIVAL_MESSAGES[j.passed.length % ARRIVAL_MESSAGES.length]
      .replace('{city}', city).replace('\n', ' ');
    lastArrivedCount = j.passed.length;
    announceMilestone('arrival', city, skipped > 0 ? `${msg} (그사이 ${skipped}곳을 더 지나왔어요)` : msg);
    contributeNow();
  } else if (j.passed.length < lastArrivedCount) {
    lastArrivedCount = j.passed.length;
  }

  const title = generateTitle(s, tracker.dateKey, mouseKm, toKm(s.scrollDistancePixels));
  tracker.setTitle(title);
  $('#daily-title').textContent = `「${title}」`;

  renderChallengeProgress(todayKm);
  updateControls();
}

// ── 주간 기록 렌더 ──
function renderWeekly() {
  const days  = loadThisWeek();
  const names = ['월', '화', '수', '목', '금', '토', '일'];
  let totKm = 0, totKeys = 0, totClicks = 0, totSec = 0;
  // 오늘 칸은 저장 전 실시간 값으로
  const live = tracker.state;
  const recOf = (d) => (d.key === tracker.dateKey ? live : d.record);
  const kms = days.map((d) => {
    const r = recOf(d);
    return r ? toKm(r.mouseDistancePixels + r.scrollDistancePixels) : 0;
  });
  days.forEach((d, i) => {
    const r = recOf(d);
    if (!r) return;
    totKm     += kms[i];
    totKeys   += r.keyCount;
    totClicks += r.clickCount;
    totSec    += r.activeSeconds;
  });
  $('#week-km').textContent     = fmtDist(totKm);
  $('#week-keys').textContent   = `${fmtInt(totKeys)}타`;
  $('#week-clicks').textContent = `${fmtInt(totClicks)}회`;
  $('#week-time').textContent   = fmtTime(totSec);

  const max = Math.max(...kms, 0.000001);
  $('#week-bars').innerHTML = days.map((d, i) => {
    const h     = Math.max(4, (kms[i] / max) * 100);
    const today = d.key === tracker.dateKey;
    return `<div class="week-bar-col" title="${d.key} · ${fmtDist(kms[i])}">
      <div class="week-bar${today ? ' today' : ''}" style="height:${h}%"></div>
      <span class="week-bar-label">${names[i]}</span>
    </div>`;
  }).join('');
}

// ── 결과 모달 ──
let currentSize = 'square';
function cardData() {
  const s        = tracker.state;
  const mouseKm  = toKm(s.mouseDistancePixels);
  const scrollM  = toKm(s.scrollDistancePixels) * 1000;
  const todayKm  = mouseKm + toKm(s.scrollDistancePixels);
  // 카드의 구간은 여행 지도와 같은 누적 기준 (예전엔 오늘 거리만으로 계산해 늘 '서울역→구리'였음)
  const j        = getJourney(lifetimeTravelKm());
  const stairs   = stairsInfo(scrollM);
  const data = {
    fromName:    j.finished ? '서울역' : j.fromName,
    toName:      j.finished ? '인천공항' : j.toName,
    travelKm:    todayKm,
    travelText:  fmtDist(todayKm),
    keyCount:    s.keyCount,
    clickCount:  s.clickCount,
    mouseKm,
    mouseText:   fmtDist(mouseKm),
    stairs,
    stairsText:  `${stairs.floors.toLocaleString()}층 (${stairs.steps.toLocaleString()}계단 · ${fmtHeight(stairs.heightM)})`,
    activeText:  fmtTime(s.activeSeconds),
    title:       s.title || generateTitle(s, tracker.dateKey, mouseKm, toKm(s.scrollDistancePixels)),
  };
  data.shareLine = pickShareLine(data, tracker.dateKey);
  return data;
}

// 캔버스는 웹폰트가 준비되기 전에 그리면 기본 글꼴로 저장된다
async function ensureFonts() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 40px Inter'), document.fonts.load('500 30px Inter')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* noop */ }
}

async function openResult() {
  const data = cardData();
  const summit = data.stairs.climbed.length > 0
    ? ` · ${data.stairs.climbed.map((m) => m.name).join('·')} 완등`
    : '';
  $('#result-sentence').innerHTML =
    `오늘 당신의 손은 <strong>${data.travelText}</strong>를 이동했어요.<br>지금 <strong>${data.fromName}</strong> → <strong>${data.toName}</strong> 구간을 여행 중입니다.`;
  $('#result-stats').innerHTML = [
    ['⌨ 키보드',    `${fmtInt(data.keyCount)}타`],
    ['🖱 마우스',    data.mouseText],
    ['👆 클릭',     `${fmtInt(data.clickCount)}회`],
    ['🪜 계단',     data.stairsText + summit],
    ['⏱ 활동 시간', data.activeText],
  ].map(([k, v]) => `<div class="result-row"><span>${k}</span><strong>${v}</strong></div>`).join('');
  $('#result-title').textContent = `「${data.title}」`;
  const nickInput = $('#challenge-nick');
  if (nickInput && !nickInput.value) nickInput.value = savedNick();
  openModal('#modal-result');
  await ensureFonts();
  drawResultCard($('#result-canvas'), data, currentSize);
}

$$('[data-card-size]').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentSize = btn.dataset.cardSize;
    $$('[data-card-size]').forEach((b) => b.classList.toggle('active', b === btn));
    drawResultCard($('#result-canvas'), cardData(), currentSize);
  });
});
$('#btn-download-card').addEventListener('click', async () => {
  await ensureFonts();
  drawResultCard($('#result-canvas'), cardData(), currentSize);
  downloadCard($('#result-canvas'), tracker.dateKey, currentSize);
  toast('결과 카드를 저장했습니다.');
});

// ── 도전장 보내기 ──
async function sendChallenge(nickOverride) {
  const typed = (nickOverride ?? $('#challenge-nick')?.value ?? '').normalize('NFC').trim().slice(0, 12);
  let nick = typed || savedNick() || '익명 여행자';
  if (!filterContent(nick).ok) {
    toast('닉네임에 쓸 수 없는 표현이 있어요. 다른 닉네임으로 바꿔주세요.');
    return;
  }
  if (typed) { try { localStorage.setItem(NICK_KEY, typed); } catch { /* noop */ } }
  const data = cardData();
  if (data.travelKm <= 0.0005) {
    toast('오늘 이동한 거리가 아직 없어요. 조금 여행한 뒤에 도전장을 보내보세요!');
    return;
  }
  await ensureFonts();
  const canvas = $('#result-canvas');
  drawResultCard(canvas, data, 'square');
  const url = buildChallengeUrl({ nick, km: data.travelKm, from: data.fromName, to: data.toName });
  const text = `🏁 ${nick}의 도전장! 오늘 손끝으로 ${data.travelText} 여행했어요 (${data.fromName}→${data.toName} 구간). 따라잡을 수 있어요?`;
  const r = await shareChallenge({ url, text, canvas });
  if (r === 'copied') toast('도전장 링크를 복사했어요. 친구에게 붙여넣어 보내세요! 📋');
  else if (r === 'shared') toast('도전장을 보냈어요! 🏁');
  else if (r === 'failed') toast('공유에 실패했어요. 결과 카드를 저장해 직접 보내주세요.');
  evaluateAndRenderBadges();
}
$('#btn-challenge')?.addEventListener('click', () => sendChallenge());

// ── 받은 도전장 ──
function initIncomingChallenge() {
  const ch = readChallengeFromUrl();
  const banner = $('#challenge-banner');
  if (!ch || !banner) return;
  $('#challenge-text').innerHTML = '';
  const strong = (t) => { const b = document.createElement('strong'); b.textContent = t; return b; };
  const p = $('#challenge-text');
  p.append(strong(ch.n), `님의 도전장 — 오늘 `, strong(fmtDist(ch.k)),
    ` 이동 · ${ch.f} → ${ch.t} 구간. 따라잡을 수 있을까요?`);
  banner.hidden = false;
  $('#challenge-accept').addEventListener('click', () => {
    saveTarget(ch);
    clearChallengeFromUrl();
    banner.hidden = true;
    if (tracker.status !== STATUS.RECORDING) toggleTracking();
    $('#today').scrollIntoView({ behavior: 'smooth' });
    toast(`도전 수락! 오늘 ${fmtDist(ch.k)}를 넘기면 승리예요 🏁`);
    render();
  });
  $('#challenge-dismiss').addEventListener('click', () => {
    clearChallengeFromUrl();
    banner.hidden = true;
  });
}

function renderChallengeProgress(todayKm) {
  const box = $('#challenge-progress');
  if (!box) return;
  const t = loadTarget();
  if (!t) { box.hidden = true; return; }
  box.hidden = false;
  const pct = Math.min(100, (todayKm / t.k) * 100);
  $('#cp-fill').style.width = `${pct.toFixed(1)}%`;
  $('#cp-now').textContent = `오늘 ${fmtDist(todayKm)}`;
  if (!t.won && todayKm >= t.k) {
    markTargetWon();
    t.won = true;
    toast(`🏆 ${t.n}님의 기록(${fmtDist(t.k)})을 넘었어요! 이번엔 내가 도전장을 보낼 차례예요.`, {
      label: '도전장 보내기', onClick: () => sendChallenge(savedNick()),
    });
    evaluateAndRenderBadges();
  }
  $('#cp-title').textContent = t.won
    ? `🏆 ${t.n}님의 ${fmtDist(t.k)} 돌파!`
    : `🏁 ${t.n}님의 ${fmtDist(t.k)} 따라잡기`;
  $('#cp-left').textContent = t.won ? '승리!' : `남은 거리 ${fmtDist(Math.max(0, t.k - todayKm))}`;
  $('#cp-send').hidden = !t.won;
  box.classList.toggle('is-won', !!t.won);
}
$('#cp-close')?.addEventListener('click', () => { clearTarget(); render(); });
$('#cp-send')?.addEventListener('click', () => sendChallenge(savedNick()));

// ── 배지 & 연속 기록 ──
function evaluateAndRenderBadges() {
  const s = tracker.state;
  const todayPx = s.mouseDistancePixels + s.scrollDistancePixels;
  const keys = new Set([...loadActiveDayKeys(), ...readExt().activeKeys]);
  if (todayPx > 0 || s.keyCount > 0) keys.add(tracker.dateKey);
  const { streak, todayActive } = computeStreak([...keys]);
  const lifeKm = lifetimeTravelKm();
  const j = getJourney(lifeKm);
  const climbed = stairsInfo(toKm(s.scrollDistancePixels) * 1000).climbed;
  let dj = false;
  try { dj = localStorage.getItem('mousekm.dj') === '1'; } catch { /* noop */ }

  const { fresh, list } = evaluateBadges({
    lifeKm,
    passed: new Set(j.passed),
    finished: j.finished,
    climbed: new Set(climbed.map((m) => m.name)),
    keysToday: s.keyCount,
    streak,
    started: tracker.status !== STATUS.OFF || lifeKm > 0,
    ext: extLifetimePx() > 0,
    posted: hasPosted(),
    dj,
    shared: hasShared(),
    challengeWon: hasWon(),
  });

  $('#streak-count').textContent = String(streak);
  $('#streak-hint').textContent = streak === 0
    ? '오늘 조금이라도 여행하면 연속 기록이 시작돼요'
    : todayActive
      ? (streak >= 7 ? '대단해요! 내일도 이어가 볼까요?' : `내일도 여행하면 ${streak + 1}일 연속!`)
      : `오늘도 여행하면 ${streak + 1}일 연속! 기록이 끊기기 전에 출발해요`;
  $('.streak-card')?.classList.toggle('is-cold', streak > 0 && !todayActive);

  const unlocked = list.filter((b) => b.unlocked).length;
  $('#badge-count').textContent = `${unlocked}/${BADGES.length}`;
  const grid = $('#badge-grid');
  const sig = list.map((b) => (b.unlocked ? 1 : 0)).join('');
  if (grid.dataset.sig !== sig) {
    grid.innerHTML = list.map((b) => `
      <li class="badge${b.unlocked ? ' is-on' : ''}" title="${b.desc}${b.at ? ` · ${b.at} 획득` : ''}">
        <span class="badge-emoji" aria-hidden="true">${b.unlocked ? b.emoji : '🔒'}</span>
        <span class="badge-name">${b.name}</span>
        <span class="sr-only">${b.unlocked ? '획득' : '미획득'} — ${b.desc}</span>
      </li>`).join('');
    grid.dataset.sig = sig;
  }

  if (fresh.length) {
    const b = fresh[0];
    toast(`🏅 배지 획득: ${b.emoji} ${b.name}${fresh.length > 1 ? ` 외 ${fresh.length - 1}개` : ''}\n${b.desc}`);
  }
}

// ── 버튼 연결 ──
function toggleTracking() {
  if (tracker.status === STATUS.RECORDING) tracker.pause();
  else if (tracker.status === STATUS.PAUSED) tracker.resume();
  else {
    tracker.start();
    toast('기록을 시작했습니다. 서울역에서 출발합니다 🚉');
    ensureMusic();
  }
  render();
  evaluateAndRenderBadges();
}

$('#btn-start-hero').addEventListener('click', () => {
  if (tracker.status !== STATUS.RECORDING) toggleTracking();
  $('#today').scrollIntoView({ behavior: 'smooth' });
});
$('#btn-toggle').addEventListener('click', toggleTracking);
$('#widget-toggle').addEventListener('click', toggleTracking);

$('#btn-reset').addEventListener('click', () => openModal('#modal-reset'));
$('#widget-reset').addEventListener('click', () => openModal('#modal-reset'));
$('#btn-reset-confirm').addEventListener('click', () => {
  tracker.reset();
  lastArrivedCount = null;     // 누적 거리가 줄었으니 기준을 다시 잡는다(재도착 알림 방지)
  lastClimbedCount = null;
  $('#modal-reset').classList.remove('open');
  render();
  renderWeekly();
  toast('오늘 기록을 삭제했습니다.');
});

$('#btn-result').addEventListener('click', openResult);
$('#widget-result').addEventListener('click', openResult);

$$('[data-open-desktop]').forEach((btn) =>
  btn.addEventListener('click', () => openModal('#modal-desktop')));
$('#btn-notify').addEventListener('click', () => {
  $('#modal-desktop').classList.remove('open');
  toast('출시되면 이 브라우저에서 알려드릴게요! (준비 중)');
});

$$('[data-open-privacy]').forEach((btn) =>
  btn.addEventListener('click', () => openModal('#modal-privacy')));
$$('[data-open-terms]').forEach((btn) =>
  btn.addEventListener('click', () => openModal('#modal-terms')));

$$('[data-chrome-cta]').forEach((btn) =>
  btn.addEventListener('click', () => toast('확장프로그램은 웹스토어 심사 준비 중이에요.\n지금은 GitHub(phjjurno/mousekm)의 extension 폴더를\nchrome://extensions → 개발자 모드로 설치할 수 있습니다.')));
$('#btn-login').addEventListener('click', () => toast('로그인은 준비 중입니다.'));

// ── 다른 사이트 체험 (페이지 내 페이지, 측정 유지) ──
let embedTimer = null;
function openEmbed(url, name, emoji, blocked) {
  const frame    = $('#embed-frame');
  const loading  = $('#embed-loading');
  const fallback = $('#embed-fallback');
  $('#embed-name').textContent  = name;
  $('#embed-emoji').textContent = emoji || '🎮';
  $('#embed-open').href = url;
  $('#embed-fallback-open').href = url;

  if (tracker.status !== STATUS.RECORDING) {
    tracker.start();
    toast(`측정을 켜고 ${name}를 불러옵니다 🎮`);
    render();
  }

  openModal('#modal-embed');
  clearTimeout(embedTimer);

  if (blocked) {
    frame.removeAttribute('src');
    frame.style.visibility = 'hidden';
    loading.hidden = true;
    $('#embed-fallback-msg').textContent =
      `${name}는 보안 설정(X-Frame-Options)으로 페이지 안에서 열 수 없어요. 새 창에서 측정을 켠 채 체험할 수 있습니다.`;
    fallback.hidden = false;
    return;
  }

  frame.style.visibility = 'hidden';
  fallback.hidden = true;
  loading.hidden  = false;
  frame.onload = null;
  frame.src = url;

  embedTimer = setTimeout(() => {
    if (loading.hidden) return;
    loading.hidden = true;
    $('#embed-fallback-msg').textContent =
      `${name}를 페이지 안에서 불러오지 못했어요. 새 창에서 열어볼 수 있습니다.`;
    fallback.hidden = false;
  }, 8000);
  frame.onload = () => {
    if (frame.getAttribute('src') === 'about:blank') return;   // 닫을 때의 빈 페이지 로드는 무시
    clearTimeout(embedTimer);
    loading.hidden  = true;
    fallback.hidden = true;
    frame.style.visibility = 'visible';
  };
}
$$('[data-embed]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    openEmbed(
      el.getAttribute('href'),
      el.dataset.embedName || '사이트',
      el.dataset.embedEmoji,
      el.hasAttribute('data-embed-block'),
    );
  });
});

if (window.matchMedia('(pointer: coarse)').matches) {
  const note = $('#mobile-note');
  if (note) note.hidden = false;
}

// ── 모니터 설정 UI ──
function renderMonitorSettings() {
  const rows     = $('#monitor-rows');
  const countSel = display.monitors.length;
  const inchOpts = (sel) => {
    const list = MONITOR_INCHES.includes(sel) || sel == null
      ? MONITOR_INCHES
      : [...MONITOR_INCHES, sel].sort((a, b) => a - b);
    return list
      .map((v) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${v}인치</option>`)
      .join('');
  };

  rows.innerHTML = `
    <div class="monitor-row">
      <label for="monitor-count">모니터 수</label>
      <select id="monitor-count" aria-label="모니터 수 선택">
        ${Array.from({ length: MAX_MONITORS }, (_, i) =>
          `<option value="${i + 1}" ${i + 1 === countSel ? 'selected' : ''}>${i + 1}대${i === 1 ? ' (듀얼)' : ''}</option>`
        ).join('')}
      </select>
    </div>
    ${display.monitors.map((m, i) => `
      <div class="monitor-row">
        <label for="monitor-inch-${i}">모니터 ${i + 1}</label>
        <select id="monitor-inch-${i}" data-monitor="${i}" aria-label="모니터 ${i + 1} 크기">
          ${inchOpts(m.inch)}
        </select>
        <span class="monitor-res">${m.resW}×${m.resH}</span>
      </div>`).join('')}
  `;

  $('#monitor-count').addEventListener('change', (e) => {
    const n = Number(e.target.value);
    while (display.monitors.length < n) display.monitors.push(defaultMonitor());
    display.monitors.length = n;
    applyDisplay();
  });
  rows.querySelectorAll('select[data-monitor]').forEach((sel) => {
    sel.addEventListener('change', () => {
      display.monitors[Number(sel.dataset.monitor)].inch = Number(sel.value);
      applyDisplay();
    });
  });
  $('#conversion-live').textContent =
    `${conversionHint(display)}${display.monitors.length > 1 ? ' · 여러 모니터는 평균 기준으로 환산합니다.' : ''}`;
}

function applyDisplay() {
  saveDisplay(display);
  kmRate = pxPerKm(display);
  lastArrivedCount = null;     // 환산 기준이 바뀌면 거리 자체가 달라지므로 기준 재설정
  lastClimbedCount = null;
  renderMonitorSettings();
  render();
  renderWeekly();
}

$('#btn-detect-monitors').addEventListener('click', async () => {
  const result = await detectMonitors();
  if (!result.ok) {
    const msgs = {
      unsupported: '이 브라우저는 자동 감지를 지원하지 않아요 (Chrome·Edge 100+ 필요).\n수동으로 모니터 수와 크기를 선택해주세요.',
      denied: '창 관리 권한이 거부됐어요.\n주소창 오른쪽 사이트 설정에서 「창 관리」를 허용한 뒤 다시 눌러주세요.',
      error: `자동 감지에 실패했어요${isMultiScreen() ? ' (권한 팝업을 확인해주세요)' : ''}.\n수동으로 선택해주세요.`,
    };
    toast(msgs[result.reason] || msgs.error);
    return;
  }
  display.monitors = result.screens.map((d, i) => ({
    inch: d.inch ?? display.monitors[i]?.inch ?? 24,
    resW: d.resW,
    resH: d.resH,
  }));
  applyDisplay();

  const n = result.screens.length;
  const inches = result.screens.map((d) => `${d.inch}″`).join(' · ');
  const anyEstimated = result.screens.some((d) => d.estimated);
  toast(result.source === 'ext' && !anyEstimated
    ? `확장프로그램으로 모니터 ${n}대를 감지했습니다.\n${inches} — 실측 크기로 환산합니다.`
    : `모니터 ${n}대를 감지했습니다.\n크기는 ${inches}로 추정했어요 — 다르면 직접 선택해주세요.`);
});

// ── 루프 시작 ──
tracker.on('rollover', () => {
  lastClimbedCount = null;     // 계단은 하루 단위라 새 날엔 기준만 다시 잡는다
  toast('자정이 지나 새로운 하루가 시작됐어요. 여행은 이어집니다.');
  renderWeekly();
  evaluateAndRenderBadges();
});

// 다른 탭에서 기록이 저장되면 누적 합계 캐시를 비운다
window.addEventListener('storage', (e) => {
  if (e.key === 'mousekm.days.v1') { invalidatePastTotals(); renderWeekly(); }
  if (e.key === 'mousekm.ext.v1') extCache.at = 0;
});
['mousekm:posted', 'mousekm:dj', 'mousekm:shared'].forEach((ev) =>
  window.addEventListener(ev, () => evaluateAndRenderBadges()));

renderMonitorSettings();
render();
renderWeekly();
evaluateAndRenderBadges();
initIncomingChallenge();
setInterval(render, TRACKING.UI_UPDATE_INTERVAL_MS);
setInterval(renderWeekly, 30_000);
setInterval(evaluateAndRenderBadges, 5_000);

if (tracker.status === STATUS.RECORDING) {
  toast('이어서 기록하고 있어요 ● 멈추려면 일시정지를 눌러주세요.');
}

// 손끝 응원 방명록 (Firebase) — 실패해도 사이트 나머지는 정상 동작
initWall().catch(() => {});

// 플레이리스트 (유튜브 임베드) — 측정 시작 시 자동 재생
initPlaylist();

// 모두의 손끝 여행 — 방문자 거리 합산
initCommunity({
  getSitePx: () => ({
    px: tracker.state.mouseDistancePixels + tracker.state.scrollDistancePixels,
    day: tracker.dateKey,
  }),
  getExtPx: extLifetimePx,
  getKmRate: () => kmRate,
});
