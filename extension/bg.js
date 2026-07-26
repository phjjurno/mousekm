// mousekm 확장 — 백그라운드(서비스 워커)
// 콘텐츠 스크립트가 보낸 수치 델타를 날짜별로 누적 저장한다. 내용 데이터는 존재하지 않는다.
'use strict';

// 설치/업데이트 직후: 이미 열려 있던 탭에도 측정 스크립트를 주입한다
// (기본 content_scripts는 이후에 여는 페이지에만 들어가므로, 새로고침 없이 바로 동작하게)
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
    for (const t of tabs) {
      if (!t.id) continue;
      chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] })
        .catch(() => { /* chrome://, 스토어 등 주입 불가 탭은 무시 */ });
    }
  });
});

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 동시 메시지로 인한 read-modify-write 경합 방지용 직렬 큐
let queue = Promise.resolve();

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'mousekm:delta') return;
  queue = queue.then(() => new Promise((done) => {
    chrome.storage.local.get({ days: {} }, ({ days }) => {
      const k = todayKey();
      const d = days[k] || { keys: 0, clicks: 0, mousePx: 0, scrollPx: 0, activeSec: 0 };
      d.keys     += msg.keys     || 0;
      d.clicks   += msg.clicks   || 0;
      d.mousePx  += msg.mousePx  || 0;
      d.scrollPx += msg.scrollPx || 0;
      d.activeSec += msg.activeSec || 0;
      days[k] = d;
      chrome.storage.local.set({ days }, done);
    });
  }));
});
