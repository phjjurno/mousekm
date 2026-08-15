/* ============================================================
   mousekm — PULSE ORIGIN 최신 업로드 자동 수집
   유튜브 채널 RSS(공개, API 키 불필요)를 서버에서 읽어
   최신 롱폼 믹스만 골라 [{id,label}] JSON 으로 내려준다.
   프론트(app.js)가 이걸 불러와 플레이리스트를 최신화한다.
   ============================================================ */
const CHANNEL_ID = 'UCLHwI49tTuxSIesBn_Zuv1w'; // @PULSEORIGN
const MAX = 12;

/* RSS 수집 실패 시 최소한의 안전망 */
const FALLBACK = [
  { id: '9E40d1donW4', label: '분위기 좋은 편집샵 재즈 힙합 🎷' },
  { id: 'N7XS4HasGk4', label: 'Late Night Jazz Hip Hop ☕' },
  { id: 'bAQlnYFfscE', label: 'Smooth R&B & Soul Mix' },
  { id: 'uVDR99PBFlg', label: '위험하게 분위기 좋은 둠칫 플리' },
  { id: 'G5PYccAFx3A', label: '걷다가 기분 좋아지는 도시팝 🚦' }
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
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MousekmBot/1.0)' }
  });
  if (!res.ok) throw new Error('rss ' + res.status);
  const xml = await res.text();

  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const out = [];
  for (const e of entries) {
    const idM = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!idM) continue;
    // 롱폼/쇼츠 판별: RSS link href 가 /shorts/ 면 쇼츠 → 제외 (제목 추측보다 정확)
    const href = (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || [])[1] || '';
    if (href.includes('/shorts/')) continue;
    const rawTitle = (e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const label = cleanLabel(rawTitle);
    if (label) out.push({ id: idM[1], label });
    if (out.length >= MAX) break;
  }
  return out;
}

/* 최신 롱폼을 앞에 두고, 부족하면 기존 롱폼 믹스로 채운다 (중복 id 제거) */
function withFallback(list) {
  const seen = new Set(list.map(t => t.id));
  const merged = list.slice();
  for (const f of FALLBACK) {
    if (merged.length >= 8) break;
    if (!seen.has(f.id)) { merged.push(f); seen.add(f.id); }
  }
  return merged;
}

exports.handler = async () => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=1800, s-maxage=1800'  // 30분 캐시
  };
  try {
    const tracks = await collect();
    return { statusCode: 200, headers, body: JSON.stringify(withFallback(tracks)) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify(FALLBACK) };
  }
};
