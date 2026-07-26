// mousekm 확장 팝업 — 오늘 기록 + 누적 여행 표시
'use strict';

// ── 여행 경로 (사이트 js/routes.js와 동일 데이터) ──
const ROUTES = [
  ['구리',0.6],['남양주',1.4],['양평',3.2],
  ['홍천',6],['횡성',10],['평창',17],['정선',26],['강릉',38],
  ['동해',50],['삼척',60],['울진',82],['영덕',102],['포항',126],['경주',146],['울산',168],['부산',205],
  ['양산',220],['밀양',246],['청도',266],['경산',286],['대구',300],
  ['고령',320],['합천',346],['진주',386],['사천',408],['하동',436],['광양',462],['순천',486],
  ['보성',520],['장흥',552],['강진',576],['해남',606],['영암',630],['목포',656],
  ['무안',676],['나주',706],['광주',732],['담양',758],['장성',780],['정읍',816],['김제',850],
  ['전주',882],['익산',910],['논산',952],['계룡',978],['대전',1006],
  ['세종',1034],['공주',1064],['천안',1108],['아산',1140],['평택',1182],['오산',1214],
  ['수원',1250],['안양',1288],['인천',1330],['인천공항',1370],
];
const START = '서울역';
const STEP_H_M = 0.175;
const SITE_URL = 'https://mousekm.ws-qf.com/';

// 거리 환산: 24인치 기본 가정 + 현재 화면 해상도 (사이트에서 정밀 설정 가능)
function pxPerKm() {
  const dpr = window.devicePixelRatio || 1;
  const w = (screen.width || 1920) * dpr, h = (screen.height || 1080) * dpr;
  const ppi = Math.hypot(w, h) / 24;
  return (ppi / 0.0254) * 1000;
}

const fmtInt = (n) => Math.round(n).toLocaleString();
function fmtDist(km) {
  if (km >= 10) return `${km.toFixed(1)}km`;
  if (km >= 1) return `${km.toFixed(2)}km`;
  if (km >= 0.001) return `${Math.round(km * 1000)}m`;
  return `${Math.round(km * 100000)}cm`;
}
function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}
function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const $ = (s) => document.querySelector(s);

function render() {
  chrome.storage.local.get({ days: {}, recording: true }, ({ days, recording }) => {
    const kmRate = pxPerKm();
    const t = days[todayKey()] || { keys:0, clicks:0, mousePx:0, scrollPx:0, activeSec:0 };

    $('#s-keys').textContent   = `${fmtInt(t.keys)}타`;
    $('#s-clicks').textContent = `${fmtInt(t.clicks)}회`;
    $('#s-mouse').textContent  = fmtDist(t.mousePx / kmRate);
    const scrollM = (t.scrollPx / kmRate) * 1000;
    const floors = Math.floor(scrollM / (STEP_H_M * 18));
    $('#s-stairs').textContent = floors > 0 ? `${floors}층` : `${Math.floor(scrollM / STEP_H_M)}계단`;
    $('#s-time').textContent   = fmtTime(t.activeSec);

    // 누적(모든 날짜) 여행
    let totalPx = 0;
    for (const k in days) totalPx += (days[k].mousePx || 0) + (days[k].scrollPx || 0);
    const km = totalPx / kmRate;

    let from = [START, 0], to = ROUTES[0];
    for (const stop of ROUTES) {
      if (km >= stop[1]) from = stop; else { to = stop; break; }
    }
    const last = ROUTES[ROUTES.length - 1];
    const finished = km >= last[1];
    if (finished) {
      $('#j-sentence').innerHTML = `<strong>전국 완주!</strong> 서울역→인천공항`;
      $('#j-fill').style.width = '100%';
      $('#j-from').textContent = START;
      $('#j-to').textContent = '🎉 완주';
      $('#j-meta').textContent = `누적 ${fmtDist(km)}`;
    } else {
      const fromName = from[0] === to[0] ? START : from[0];
      const span = to[1] - from[1];
      const prog = span > 0 ? Math.max(0, Math.min(1, (km - from[1]) / span)) : 0;
      $('#j-sentence').innerHTML = `<strong>${fromName}</strong> 지나 <strong>${to[0]}</strong> 방향`;
      $('#j-fill').style.width = `${(prog * 100).toFixed(1)}%`;
      $('#j-from').textContent = fromName;
      $('#j-to').textContent = to[0];
      $('#j-meta').textContent = `누적 ${fmtDist(km)} · ${to[0]}까지 ${fmtDist(to[1] - km)}`;
    }

    // 상태 배지/버튼
    const badge = $('#badge');
    badge.textContent = recording ? '● 기록 중' : 'Ⅱ 일시정지';
    badge.classList.toggle('paused', !recording);
    $('#btn-toggle').textContent = recording ? '일시정지' : '기록 재개';
  });
}

$('#btn-toggle').addEventListener('click', () => {
  chrome.storage.local.get({ recording: true }, ({ recording }) => {
    chrome.storage.local.set({ recording: !recording }, render);
  });
});
$('#btn-site').addEventListener('click', () => chrome.tabs.create({ url: SITE_URL }));

render();
setInterval(render, 1500);
