// 계단·산 등반 시스템 — 물리 기준
// 건축법 권장 계단 높이 175mm (KS F 3021 기준)

export const STEP_H_M  = 0.175;       // 계단 한 단: 175mm
export const FLOOR_H_M = STEP_H_M * 18; // 1층 = 18단 × 175mm = 3.15m (일반 건물 기준)

// 국내 실제 산 — 해발 고도(m) 기준 오름차순
export const MOUNTAINS = [
  { name: '남산',    height: 262,  region: '서울',     note: '서울 도심 한복판 명산',       emoji: '🌿' },
  { name: '청계산',  height: 618,  region: '서울/경기', note: '강남 직장인의 저녁 등산 코스', emoji: '⛰️' },
  { name: '관악산',  height: 632,  region: '서울/경기', note: '수능 합격 기도 명소',          emoji: '⛰️' },
  { name: '수락산',  height: 638,  region: '서울/경기', note: '노원 직장인의 퇴근 산',        emoji: '⛰️' },
  { name: '도봉산',  height: 740,  region: '서울/경기', note: '암릉 등반 명소',               emoji: '⛰️' },
  { name: '북한산',  height: 836,  region: '서울/경기', note: '세계 최다 방문 국립공원',      emoji: '🏔️' },
  { name: '속리산',  height: 1058, region: '충북',     note: '법주사 품은 유네스코 명산',     emoji: '🏔️' },
  { name: '치악산',  height: 1288, region: '강원',     note: '험하기로 유명한 원주 명산',     emoji: '🏔️' },
  { name: '가야산',  height: 1430, region: '경남',     note: '해인사 품은 산',               emoji: '🏔️' },
  { name: '소백산',  height: 1440, region: '충북/경북', note: '연화봉 철쭉으로 유명',         emoji: '🏔️' },
  { name: '태백산',  height: 1567, region: '강원',     note: '눈 축제로 유명한 설산',        emoji: '❄️' },
  { name: '덕유산',  height: 1614, region: '전북/경남', note: '무주 스키장 옆 겨울 명산',     emoji: '🏔️' },
  { name: '설악산',  height: 1708, region: '강원',     note: '가을 단풍 최고 명소',          emoji: '🍂' },
  { name: '지리산',  height: 1915, region: '전남/경남', note: '남한 최대 국립공원',           emoji: '🌲' },
  { name: '한라산',  height: 1950, region: '제주',     note: '남한 최고봉 백록담',           emoji: '🌋' },
];

// 스크롤 미터 → 계단·층·등반 정보
export function stairsInfo(scrollMeters) {
  const steps   = Math.floor(scrollMeters / STEP_H_M);
  const floors  = Math.floor(scrollMeters / FLOOR_H_M);
  const climbed = MOUNTAINS.filter(m => scrollMeters >= m.height);
  const next    = MOUNTAINS.find(m => scrollMeters < m.height) ?? null;
  return { steps, floors, heightM: scrollMeters, climbed, next };
}

export function fmtHeight(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(2)}km`;
  if (m >= 1)    return `${m.toFixed(1)}m`;
  return `${Math.round(m * 100)}cm`;
}
