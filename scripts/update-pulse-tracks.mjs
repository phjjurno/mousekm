/* ============================================================
   mousekm — PULSE ORIGIN 최신 업로드 수집 (빌드 타임)
   유튜브 채널 RSS(공개, API 키 불필요)를 읽어 최신 롱폼만 골라
   data/pulse-tracks.json 으로 저장한다.
   GitHub Actions가 주기적으로 실행 → 변경 시 커밋 → Netlify 자동 배포.
   ============================================================ */
import { writeFile, readFile } from 'node:fs/promises';

const CHANNEL_ID = 'UCLHwI49tTuxSIesBn_Zuv1w'; // @PULSEORIGN
const MAX = 12;
const OUT = new URL('../data/pulse-tracks.json', import.meta.url);

/* 수집 실패 시 안전망 (기존 목록 유지가 우선, 그것도 없으면 이 값) */
const FALLBACK = [
  { id: '9E40d1donW4', label: '분위기 좋은 편집샵 재즈 힙합 🎷' },
  { id: 'N7XS4HasGk4', label: 'Late Night Jazz Hip Hop ☕' },
  { id: 'bAQlnYFfscE', label: 'Smooth R&B & Soul Mix' },
  { id: 'uVDR99PBFlg', label: '위험하게 분위기 좋은 둠칫 플리' },
  { id: 'G5PYccAFx3A', label: '걷다가 기분 좋아지는 도시팝 🚦' },
];

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/* 해시태그·장식 문자 정리 + 길이 제한 */
function cleanLabel(t) {
  let s = decodeEntities(t)
    .replace(/⁽[^⁾]*⁾/g, ' ')        // ⁽ᴾˡᵃʸˡⁱˢᵗ⁾ 같은 위첨자 장식 제거
    .replace(/[#＃][^\s#＃]+/g, ' ')  // 해시태그 제거
    .replace(/[|｜·・]+/g, ' ')       // 구분자 정리
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > 40) s = s.slice(0, 39).trim() + '…';
  return s;
}

async function collect() {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MousekmBot/1.0)' },
  });
  if (!res.ok) throw new Error('rss ' + res.status);
  const xml = await res.text();

  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const out = [];
  for (const e of entries) {
    const idM = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!idM) continue;
    // 롱폼/쇼츠 판별: RSS link href 가 /shorts/ 면 쇼츠 → 제외
    const href = (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || [])[1] || '';
    if (href.includes('/shorts/')) continue;
    const rawTitle = (e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const label = cleanLabel(rawTitle);
    if (label) out.push({ id: idM[1], label });
    if (out.length >= MAX) break;
  }
  return out;
}

/* 최신 롱폼을 앞에 두고, 부족하면 기존 목록으로 채운다 (중복 id 제거) */
function withFallback(list, prev) {
  const seen = new Set(list.map((t) => t.id));
  const merged = list.slice();
  for (const f of [...prev, ...FALLBACK]) {
    if (merged.length >= MAX) break;
    if (f?.id && !seen.has(f.id)) { merged.push(f); seen.add(f.id); }
  }
  return merged;
}

async function readPrev() {
  try { return JSON.parse(await readFile(OUT, 'utf8')); } catch { return []; }
}

const prev = await readPrev();
let tracks;
try {
  tracks = withFallback(await collect(), prev);
} catch (e) {
  console.error('수집 실패 — 기존 목록 유지:', e.message);
  process.exit(prev.length ? 0 : 1);   // 기존 목록이 있으면 그대로 두고 성공 처리
}

const next = JSON.stringify(tracks, null, 2) + '\n';
const before = JSON.stringify(prev, null, 2) + '\n';
if (next === before) {
  console.log('변경 없음 —', tracks.length, '곡');
} else {
  await writeFile(OUT, next);
  console.log('업데이트됨 —', tracks.length, '곡');
  tracks.forEach((t, i) => console.log(` ${i + 1}. ${t.label} (${t.id})`));
}
