// mousekm 확장 — 사이트 연동 브리지 (mousekm.ws-qf.com 전용)
// 확장이 크롬 전체에서 누적한 수치를 사이트 localStorage('mousekm.ext.v1')에 밀어 넣어,
// 사이트의 여행 지도가 확장 기록까지 합산해 보여주게 한다.
'use strict';

function push(days) {
  try {
    localStorage.setItem('mousekm.ext.v1', JSON.stringify({ updatedAt: Date.now(), days: days || {} }));
  } catch { /* 저장 실패 시 다음 변경에서 재시도 */ }
}

chrome.storage.local.get({ days: {} }, ({ days }) => push(days));
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch.days) push(ch.days.newValue);
});
