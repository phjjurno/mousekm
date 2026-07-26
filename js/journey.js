// 종합 거리 → 여행 경로 변환
import { ROUTES, START_NAME } from './routes.js?v=5';

// 현재 여행 상태 계산: 출발지·다음 목적지·구간 진행률·지나온 도시
export function getJourney(travelKm) {
  let passed = [];
  let from = { name: START_NAME, km: 0 };
  let to = ROUTES[0];

  for (const stop of ROUTES) {
    if (travelKm >= stop.km) {
      passed.push(stop.name);
      from = stop;
    } else {
      to = stop;
      break;
    }
  }

  const last = ROUTES[ROUTES.length - 1];
  const finished = travelKm >= last.km;
  if (finished) {
    return {
      fromName: last.name, toName: last.name, progress: 1,
      remainKm: 0, passed, finished: true,
    };
  }

  const span = to.km - from.km;
  const progress = span > 0 ? Math.min(1, Math.max(0, (travelKm - from.km) / span)) : 0;

  return {
    fromName: from.name === to.name ? START_NAME : from.name,
    toName: to.name,
    progress,
    remainKm: Math.max(0, to.km - travelKm),
    passed,
    finished: false,
  };
}
