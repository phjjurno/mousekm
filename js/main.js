// mousekm 메인 — 측정 엔진과 UI를 연결한다
import { TRACKING } from './config.js?v=7';
import { ARRIVAL_MESSAGES } from './routes.js?v=7';
import { createTracker, STATUS } from './tracker.js?v=7';
import { getJourney } from './journey.js?v=7';
import { generateTitle } from './titleGenerator.js?v=7';
import { loadThisWeek, loadLifetimeTotals, loadDay } from './storage.js?v=7';
import { drawResultCard, downloadCard, pickShareLine } from './resultCard.js?v=7';
import {
  loadDisplay, saveDisplay, pxPerKm, conversionHint,
  detectMonitors, isMultiScreen, defaultMonitor, MONITOR_INCHES, MAX_MONITORS,
} from './display.js?v=7';
import { stairsInfo, fmtHeight, MOUNTAINS } from './stairs.js?v=7';
import { initWall } from './wall.js?v=7';
import { initPlaylist, ensureMusic } from './playlist.js?v=7';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const tracker = createTracker();
let display  = loadDisplay();
let kmRate   = pxPerKm(display);
let lastArrivedCount = null;
let lastClimbedCount = 0;   // 새 산 완등 감지용

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

// ── 토스트 ──
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

// ── 모달 ──
function openModal(id) { $(id).classList.add('open'); }
function closeModal(el) { el.closest('.modal-backdrop').classList.remove('open'); }
$$('.modal-backdrop').forEach((bg) => {
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.classList.remove('open'); });
});
$$('[data-close]').forEach((btn) => btn.addEventListener('click', () => closeModal(btn)));

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

// ── 계단·산 툴팁 업데이트 ──
function updateMountainTip(stairs) {
  const { heightM, steps, floors, climbed, next } = stairs;

  // 카드 내 1차 정보
  $('#stat-scroll').textContent    = floors > 0 ? `${floors.toLocaleString()}층` : `${steps}계단`;
  $('#stat-scroll-sub').textContent = `${steps.toLocaleString()}계단 · ${fmtHeight(heightM)}`;

  // 완등 배지 (최근 완등 산 표시)
  const summitEl = $('#stairs-summit');
  if (climbed.length > 0) {
    const last = climbed[climbed.length - 1];
    summitEl.textContent = `${last.emoji} ${last.name} 완등!`;
  } else {
    summitEl.textContent = '';
  }

  // 새 산 완등 감지 → 토스트
  if (climbed.length > lastClimbedCount) {
    const newMt = climbed[climbed.length - 1];
    toast(`${newMt.emoji} ${newMt.name} 완등! (해발 ${newMt.height}m)\n${newMt.note}`);
    lastClimbedCount = climbed.length;
  }

  // 툴팁 상세
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
    // 한라산까지 모두 완등
    $('#mt-emoji').textContent  = '🌋';
    $('#mt-title').textContent  = '모든 산 완등!';
    $('#mt-sub').textContent    = '한라산 정상까지 올랐습니다';
    $('#mt-progress-fill').style.width = '100%';
    $('#mt-pct').textContent    = '100%';
    $('#mt-target').textContent = `총 ${fmtHeight(heightM)} 등반`;
  }

  // 완등 목록
  $('#mt-climbed-list').innerHTML = MOUNTAINS.map((m) => {
    const done = climbed.some((c) => c.name === m.name);
    return `<span class="mt-climbed-chip${done ? ' done' : ''}" title="${m.height}m">
      ${done ? '✓' : '○'} ${m.name}
    </span>`;
  }).join('');
}

// ── 터치 디바이스: 탭으로 툴팁 토글 ──
$('#stairs-card')?.addEventListener('click', (e) => {
  if (!window.matchMedia('(pointer:coarse)').matches) return;
  $('#stairs-card').classList.toggle('tip-open');
});

// 크롬 확장이 남긴 누적 기록(px) — 확장 브리지가 localStorage('mousekm.ext.v1')에 기록
// (확장은 mousekm 사이트 자체를 측정하지 않으므로 이중 합산 없음)
function extLifetimePx() {
  try {
    const ext = JSON.parse(localStorage.getItem('mousekm.ext.v1'));
    let sum = 0;
    for (const k in (ext?.days || {})) {
      const d = ext.days[k];
      sum += (d.mousePx || 0) + (d.scrollPx || 0);
    }
    return sum;
  } catch { return 0; }
}

// 누적(평생) 여행 거리 — 저장된 모든 날짜 + 오늘의 실시간 상태 + 확장 기록
function lifetimeTravelKm() {
  const totals = loadLifetimeTotals();               // 오늘의 '저장된' 스냅샷 포함
  const saved  = loadDay(tracker.dateKey);           // 오늘의 저장 스냅샷
  const live   = tracker.state;
  const mousePx  = totals.mousePx  - (saved.mouseDistancePixels  || 0) + live.mouseDistancePixels;
  const scrollPx = totals.scrollPx - (saved.scrollDistancePixels || 0) + live.scrollDistancePixels;
  return toKm(mousePx + scrollPx + extLifetimePx());
}

// ── 실시간 대시보드 렌더 ──
function render() {
  const s        = tracker.state;
  const mouseKm  = toKm(s.mouseDistancePixels);
  const scrollM  = toKm(s.scrollDistancePixels) * 1000; // km → m
  const todayKm  = mouseKm + toKm(s.scrollDistancePixels);
  const travelKm = lifetimeTravelKm();               // 여행 지도는 누적 거리 기준

  $('#stat-keys').textContent   = `${fmtInt(s.keyCount)}타`;
  $('#stat-mouse').textContent  = fmtDist(mouseKm);
  $('#stat-clicks').textContent = `${fmtInt(s.clickCount)}회`;
  $('#stat-time').textContent   = fmtTime(s.activeSeconds);

  // 계단 & 산
  updateMountainTip(stairsInfo(scrollM));

  // 위젯
  $('#widget-keys').textContent   = `⌨ ${fmtInt(s.keyCount)}`;
  $('#widget-mouse').textContent  = `🖱 ${fmtDist(mouseKm)}`;
  $('#widget-clicks').textContent = `👆 ${fmtInt(s.clickCount)}`;

  // 여행 지도 (누적 거리 기준 — 전국 시·군을 천천히 순회)
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
    ? `당신의 손끝이 <strong>서울역</strong>에서 출발해<br><strong>전국 시·군</strong>을 완주했습니다.`
    : `당신의 손끝은 지금<br><strong>${j.fromName}</strong>을(를) 지나 <strong>${j.toName}</strong> 방향으로 가고 있습니다.`;

  const passedEl = $('#journey-passed');
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

  // 경유지 도착 알림
  if (lastArrivedCount === null) {
    lastArrivedCount = j.passed.length;
  } else if (j.passed.length > lastArrivedCount) {
    const city = j.passed[j.passed.length - 1];
    const msg  = ARRIVAL_MESSAGES[j.passed.length % ARRIVAL_MESSAGES.length];
    toast(msg.replace('{city}', city).replace('\n', ' '));
    lastArrivedCount = j.passed.length;
  }

  // 오늘의 칭호
  const title = generateTitle(s, tracker.dateKey, mouseKm, toKm(s.scrollDistancePixels));
  tracker.setTitle(title);
  $('#daily-title').textContent = `「${title}」`;

  updateControls();
}

// ── 주간 기록 렌더 ──
function renderWeekly() {
  const days  = loadThisWeek();
  const names = ['월', '화', '수', '목', '금', '토', '일'];
  let totKm = 0, totKeys = 0, totClicks = 0, totSec = 0;
  const kms = days.map((d) =>
    d.record ? toKm(d.record.mouseDistancePixels + d.record.scrollDistancePixels) : 0);
  days.forEach((d, i) => {
    if (!d.record) return;
    totKm    += kms[i];
    totKeys  += d.record.keyCount;
    totClicks += d.record.clickCount;
    totSec   += d.record.activeSeconds;
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
  const travelKm = mouseKm + toKm(s.scrollDistancePixels);
  const j        = getJourney(travelKm);
  const stairs   = stairsInfo(scrollM);
  const data = {
    fromName:    '서울역',
    toName:      j.finished ? '지구 한 바퀴' : j.toName,
    travelKm,
    travelText:  fmtDist(travelKm),
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

function openResult() {
  const data = cardData();
  const summit = data.stairs.climbed.length > 0
    ? ` · ${data.stairs.climbed.map(m => m.name).join('·')} 완등`
    : '';
  $('#result-sentence').innerHTML =
    `오늘 당신의 손은<br><strong>서울역</strong>에서 <strong>${data.toName}</strong> 방향으로<br>${data.travelText} 이동했습니다.`;
  $('#result-stats').innerHTML = [
    ['⌨ 키보드',    `${fmtInt(data.keyCount)}타`],
    ['🖱 마우스',    data.mouseText],
    ['👆 클릭',     `${fmtInt(data.clickCount)}회`],
    ['🪜 계단',     data.stairsText + summit],
    ['⏱ 활동 시간', data.activeText],
  ].map(([k, v]) => `<div class="result-row"><span>${k}</span><strong>${v}</strong></div>`).join('');
  $('#result-title').textContent = `「${data.title}」`;
  drawResultCard($('#result-canvas'), data, currentSize);
  openModal('#modal-result');
}

$$('[data-card-size]').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentSize = btn.dataset.cardSize;
    $$('[data-card-size]').forEach((b) => b.classList.toggle('active', b === btn));
    drawResultCard($('#result-canvas'), cardData(), currentSize);
  });
});
$('#btn-download-card').addEventListener('click', () => {
  drawResultCard($('#result-canvas'), cardData(), currentSize);
  downloadCard($('#result-canvas'), tracker.dateKey, currentSize);
  toast('결과 카드를 저장했습니다.');
});

// ── 버튼 연결 ──
function toggleTracking() {
  if (tracker.status === STATUS.RECORDING) tracker.pause();
  else if (tracker.status === STATUS.PAUSED) tracker.resume();
  else {
    tracker.start();
    toast('기록을 시작했습니다. 서울역에서 출발합니다 🚉');
    ensureMusic();   // 측정 시작과 함께 플레이리스트 자동 재생
  }
  render();
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
  lastArrivedCount = 0;
  lastClimbedCount = 0;
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

  // 측정이 꺼져 있으면 켜서 "기능이 켜진 채로" 체험하게 한다
  if (tracker.status !== STATUS.RECORDING) {
    tracker.start();
    toast(`측정을 켜고 ${name}를 불러옵니다 🎮`);
    render();
  }

  openModal('#modal-embed');
  clearTimeout(embedTimer);

  // 임베드가 차단된 사이트(X-Frame-Options 등): 바로 안내 + 새 창
  if (blocked) {
    frame.removeAttribute('src');
    frame.style.visibility = 'hidden';
    loading.hidden = true;
    $('#embed-fallback-msg').textContent =
      `${name}는 보안 설정(X-Frame-Options)으로 페이지 안에서 열 수 없어요. 새 창에서 측정을 켠 채 체험할 수 있습니다.`;
    fallback.hidden = false;
    return;
  }

  // 임베드 가능한 사이트: 로딩 표시 후 인라인 로드
  frame.style.visibility = 'hidden';
  fallback.hidden = true;
  loading.hidden  = false;
  frame.src = url;

  // 혹시 모를 로드 실패 대비: 시간 내 onload 없으면 대체 안내
  embedTimer = setTimeout(() => {
    if (loading.hidden) return;         // 이미 로드됨
    loading.hidden = true;
    $('#embed-fallback-msg').textContent =
      `${name}를 페이지 안에서 불러오지 못했어요. 새 창에서 열어볼 수 있습니다.`;
    fallback.hidden = false;
  }, 8000);
  frame.onload = () => {
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
// 모달이 닫힐 때 iframe 정리(리소스 해제)
$('#modal-embed')?.addEventListener('click', (e) => {
  if (e.target.id === 'modal-embed') {
    const f = $('#embed-frame'); if (f) f.src = 'about:blank';
  }
});
$('#modal-embed')?.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => { const f = $('#embed-frame'); if (f) f.src = 'about:blank'; }));

if (window.matchMedia('(pointer: coarse)').matches) {
  const note = $('#mobile-note');
  if (note) note.hidden = false;
}

// ── 모니터 설정 UI ──
function renderMonitorSettings() {
  const rows     = $('#monitor-rows');
  const countSel = display.monitors.length;
  // 감지된 인치가 기본 목록에 없으면 그 값도 선택지로 추가한다 (예: 27.3인치)
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
  lastArrivedCount = 0;
  lastClimbedCount = 0;
  toast('자정이 지나 새로운 여행이 시작됐습니다.');
  renderWeekly();
});

renderMonitorSettings();
render();
renderWeekly();
setInterval(render, TRACKING.UI_UPDATE_INTERVAL_MS);
setInterval(renderWeekly, 30_000);

// 손끝 응원 방명록 (Firebase 익명) — 실패해도 사이트 나머지는 정상 동작
initWall().catch(() => {});

// 플레이리스트 (유튜브 임베드) — 측정 시작 시 자동 재생
initPlaylist();
