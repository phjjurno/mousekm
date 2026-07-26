// 오늘의 칭호 자동 부여 — 기록 패턴에 따라 카테고리를 정하고,
// 날짜 기반 시드로 같은 날에는 같은 문구가 유지되게 한다.
import { TITLES } from './titles.js?v=3';

function seededIndex(seedStr, len) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  return h % len;
}

// mouseKm/scrollKm은 모니터 기준 실거리(km)
export function generateTitle(state, dateKey, mouseKm, scrollKm) {
  const activeMin = state.activeSeconds / 60;

  // 활동이 거의 없으면 스타터 칭호 (실거리 5m 미만)
  const anyActivity = state.keyCount + state.clickCount > 5 || mouseKm > 0.005;
  if (!anyActivity) {
    return TITLES.starter[seededIndex(dateKey, TITLES.starter.length)];
  }

  // 각 지표를 대략적인 "하루 기준치" 대비 비율로 정규화해 가장 두드러진 카테고리 선택
  const scores = {
    keyboard: state.keyCount / 10_000,
    click: state.clickCount / 600,
    mouse: mouseKm / 0.06,   // 하루 60m면 마우스 장거리
    scroll: scrollKm / 0.25, // 하루 250m면 스크롤 폭주
    time: activeMin / 180,
  };
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topCat, topVal] = entries[0];
  const above = entries.filter(([, v]) => v >= 0.5).length;

  // 여러 수치가 고르게 높으면 종합형
  const cat = above >= 3 ? 'overall' : topVal > 0 ? topCat : 'starter';
  const pool = TITLES[cat];
  return pool[seededIndex(dateKey + cat, pool.length)];
}
