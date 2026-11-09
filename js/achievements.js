// 여행 배지 & 연속 기록 — 전부 이 브라우저 안에서만 계산·저장한다 (서버 전송 없음)
import { todayKey } from './storage.js?v=10';

const KEY = 'mousekm.badges.v1';

// test(c): c = { lifeKm, passed(Set), finished, climbed(Set, 오늘), keysToday, streak,
//                started, ext, posted, dj, shared, challengeWon }
export const BADGES = [
  { id: 'start',    emoji: '🚉', name: '첫 출발',     desc: '측정을 처음 시작했어요',            test: (c) => c.started },
  { id: 'm100',     emoji: '👣', name: '첫 100m',    desc: '누적 100m를 이동했어요',            test: (c) => c.lifeKm >= 0.1 },
  { id: 'guri',     emoji: '🏙️', name: '서울 탈출',   desc: '첫 도시 구리에 도착했어요',          test: (c) => c.passed.has('구리') },
  { id: 'km5',      emoji: '🏃', name: '5km 완주',   desc: '누적 5km를 이동했어요',             test: (c) => c.lifeKm >= 5 },
  { id: 'gangneung', emoji: '🌊', name: '동해 바다',   desc: '강릉에 도착해 바다를 봤어요',        test: (c) => c.passed.has('강릉') },
  { id: 'busan',    emoji: '⚓', name: '부산 입성',   desc: '부산에 도착했어요',                  test: (c) => c.passed.has('부산') },
  { id: 'mokpo',    emoji: '🐙', name: '남도 한 바퀴', desc: '목포에 도착했어요',                  test: (c) => c.passed.has('목포') },
  { id: 'finish',   emoji: '✈️', name: '전국 완주',   desc: '인천공항까지 전국을 돌았어요',        test: (c) => c.finished },
  { id: 'namsan',   emoji: '🌿', name: '남산 정복',   desc: '하루 스크롤로 남산(262m)을 올랐어요', test: (c) => c.climbed.has('남산') },
  { id: 'halla',    emoji: '🌋', name: '한라산 정복', desc: '하루 스크롤로 한라산(1950m)을 올랐어요', test: (c) => c.climbed.has('한라산') },
  { id: 'keys10k',  emoji: '⌨️', name: '하루 만 타',  desc: '하루에 키보드 10,000타',              test: (c) => c.keysToday >= 10_000 },
  { id: 'streak3',  emoji: '🔥', name: '3일 연속',    desc: '3일 연속으로 여행했어요',            test: (c) => c.streak >= 3 },
  { id: 'streak7',  emoji: '💎', name: '일주일 개근', desc: '7일 연속으로 여행했어요',            test: (c) => c.streak >= 7 },
  { id: 'cheer',    emoji: '💬', name: '첫 응원',     desc: '응원 게시판에 한 줄을 남겼어요',      test: (c) => c.posted },
  { id: 'dj',       emoji: '🎧', name: '손끝 DJ',    desc: '플레이리스트에서 곡을 골랐어요',      test: (c) => c.dj },
  { id: 'chrome',   emoji: '🧩', name: '크롬 여행자', desc: '확장프로그램으로 크롬 전체를 여행 중', test: (c) => c.ext },
  { id: 'rival',    emoji: '🏁', name: '도전장 발송', desc: '친구에게 도전장을 보냈어요',          test: (c) => c.shared },
  { id: 'winner',   emoji: '🏆', name: '도전 승리',   desc: '받은 도전장의 기록을 넘었어요',      test: (c) => c.challengeWon },
];

function loadUnlocked() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}
function saveUnlocked(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* noop */ }
}

function keyOf(date) { return todayKey(date); }

// 오늘(또는 오늘 아직 기록이 없으면 어제)부터 거꾸로 이어진 활동일 수
export function computeStreak(activeKeys, now = new Date()) {
  const set = new Set(activeKeys);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayActive = set.has(keyOf(d));
  if (!todayActive) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(keyOf(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return { streak: n, todayActive };
}

// 조건을 평가해 새로 달성한 배지를 돌려준다.
// 기능을 처음 보는 사용자는 이미 만족한 배지를 조용히 채운다(알림 폭탄 방지).
export function evaluateBadges(ctx) {
  let unlocked = loadUnlocked();
  const firstRun = unlocked === null;
  if (firstRun) unlocked = {};
  const fresh = [];
  for (const b of BADGES) {
    if (unlocked[b.id]) continue;
    let ok = false;
    try { ok = !!b.test(ctx); } catch { ok = false; }
    if (ok) {
      unlocked[b.id] = todayKey();
      if (!firstRun) fresh.push(b);
    }
  }
  if (firstRun || fresh.length) saveUnlocked(unlocked);
  return {
    fresh,
    list: BADGES.map((b) => ({ ...b, unlocked: !!unlocked[b.id], at: unlocked[b.id] || null })),
  };
}
