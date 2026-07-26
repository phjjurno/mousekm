// mousekm 확장 — 사이트 연동 브리지 (mousekm.ws-qf.com 전용)
// 확장이 크롬 전체에서 누적한 수치와 감지한 모니터 정보를 사이트 localStorage에 밀어 넣는다.
'use strict';

function push(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ updatedAt: Date.now(), ...value }));
  } catch { /* 저장 실패 시 다음 변경에서 재시도 */ }
}

chrome.storage.local.get({ days: {}, displays: [] }, ({ days, displays }) => {
  push('mousekm.ext.v1', { days: days || {} });
  if (displays?.length) push('mousekm.ext.display.v1', { displays });
});

chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (ch.days)     push('mousekm.ext.v1', { days: ch.days.newValue || {} });
  if (ch.displays) push('mousekm.ext.display.v1', { displays: ch.displays.newValue || [] });
});
