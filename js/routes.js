// 여행 경로: 서울역에서 출발해 전국 시·군을 한 바퀴 도는 순회 코스
// 순서 — 서울역 → (동) 강원 강릉 → (남) 동해안 → 부산 → 대구 → (서남) 목포 → (북) 대전 → 인천공항
// km = 서울역 기준 누적 실거리 근사치. 여행 지도는 '누적(평생) 이동거리'를 따라 이 경로를 천천히 나아간다.
// 거리 간격은 초반엔 촘촘(빠르게 다음 도시로)하고 뒤로 갈수록 넓어진다(천천히).
// → 시작하자마자 "서울역을 지나 ○○로 가는 중"이라는 여행의 감각이 살아난다.
export const ROUTES = [
  // ── 수도권 동부 (출발 직후, 빠르게 스쳐가는 첫 도시들) ──
  { name: '구리',     km: 0.6,  region: '경기' },
  { name: '남양주',   km: 1.4,  region: '경기' },
  { name: '양평',     km: 3.2,  region: '경기' },

  // ── 강원 영서 → 영동 (동진, 강릉까지) ──
  { name: '홍천',     km: 6,    region: '강원' },
  { name: '횡성',     km: 10,   region: '강원' },
  { name: '평창',     km: 17,   region: '강원' },
  { name: '정선',     km: 26,   region: '강원' },
  { name: '강릉',     km: 38,   region: '강원' },

  // ── 동해안 남하 (강릉 → 부산) ──
  { name: '동해',     km: 50,   region: '강원' },
  { name: '삼척',     km: 60,   region: '강원' },
  { name: '울진',     km: 82,   region: '경북' },
  { name: '영덕',     km: 102,  region: '경북' },
  { name: '포항',     km: 126,  region: '경북' },
  { name: '경주',     km: 146,  region: '경북' },
  { name: '울산',     km: 168,  region: '울산' },
  { name: '부산',     km: 205,  region: '부산' },

  // ── 부산 → 대구 (경남·경북 내륙) ──
  { name: '양산',     km: 220,  region: '경남' },
  { name: '밀양',     km: 246,  region: '경남' },
  { name: '청도',     km: 266,  region: '경북' },
  { name: '경산',     km: 286,  region: '경북' },
  { name: '대구',     km: 300,  region: '대구' },

  // ── 대구 → 목포 (경남·전남 남부 횡단) ──
  { name: '고령',     km: 320,  region: '경북' },
  { name: '합천',     km: 346,  region: '경남' },
  { name: '진주',     km: 386,  region: '경남' },
  { name: '사천',     km: 408,  region: '경남' },
  { name: '하동',     km: 436,  region: '경남' },
  { name: '광양',     km: 462,  region: '전남' },
  { name: '순천',     km: 486,  region: '전남' },
  { name: '보성',     km: 520,  region: '전남' },
  { name: '장흥',     km: 552,  region: '전남' },
  { name: '강진',     km: 576,  region: '전남' },
  { name: '해남',     km: 606,  region: '전남' },
  { name: '영암',     km: 630,  region: '전남' },
  { name: '목포',     km: 656,  region: '전남' },

  // ── 목포 → 대전 (전남·전북·충청 북상) ──
  { name: '무안',     km: 676,  region: '전남' },
  { name: '나주',     km: 706,  region: '전남' },
  { name: '광주',     km: 732,  region: '광주' },
  { name: '담양',     km: 758,  region: '전남' },
  { name: '장성',     km: 780,  region: '전남' },
  { name: '정읍',     km: 816,  region: '전북' },
  { name: '김제',     km: 850,  region: '전북' },
  { name: '전주',     km: 882,  region: '전북' },
  { name: '익산',     km: 910,  region: '전북' },
  { name: '논산',     km: 952,  region: '충남' },
  { name: '계룡',     km: 978,  region: '충남' },
  { name: '대전',     km: 1006, region: '대전' },

  // ── 대전 → 인천공항 (충청·경기·인천 북상, 대미) ──
  { name: '세종',     km: 1034, region: '세종' },
  { name: '공주',     km: 1064, region: '충남' },
  { name: '천안',     km: 1108, region: '충남' },
  { name: '아산',     km: 1140, region: '충남' },
  { name: '평택',     km: 1182, region: '경기' },
  { name: '오산',     km: 1214, region: '경기' },
  { name: '수원',     km: 1250, region: '경기' },
  { name: '안양',     km: 1288, region: '경기' },
  { name: '인천',     km: 1330, region: '인천' },
  { name: '인천공항', km: 1370, region: '인천' },
];

export const START_NAME = '서울역';

// 목적지 도착 알림 문구 ({city}가 도시 이름으로 치환됨)
export const ARRIVAL_MESSAGES = [
  '{city}에 도착했습니다.\n손끝으로 전국을 여행하는 중이에요.',
  '{city} 도착.\n다음 시·군으로 계속 나아갑니다.',
  '{city}에 도착했습니다.\n오늘도 한 걸음 더 멀리 왔네요.',
];
