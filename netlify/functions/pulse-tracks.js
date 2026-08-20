/* ============================================================
   mousekm — PULSE ORIGIN 최신 롱폼 업로드 자동 수집
   쇼츠를 빼고 롱폼만 [{id,label}] JSON 으로 내려준다. API 키 불필요.
   프론트(js/playlist.js)가 이걸 먼저 부르고, 실패하면 data/pulse-tracks.json 을 쓴다.

   소스 순서:
   1) 채널 '동영상(/videos)' 탭 — 쇼츠는 별도 탭이라 애초에 안 섞인다 (주력)
   2) 채널 RSS — link href 가 /shorts/ 인 항목 제외 (보조, 최근 15개 한정)
   3) 아래 FALLBACK 롱폼 목록
   MIST·서트레스와 동일한 수집기.
   ============================================================ */
const CHANNEL_ID = 'UCLHwI49tTuxSIesBn_Zuv1w'; // @PULSEORIGN
const VIDEOS_TAB = 'https://www.youtube.com/@PULSEORIGN/videos';
const RSS = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const MAX = 12;
const MIN_SECONDS = 180;   // 3분 미만은 쇼츠·예고편으로 보고 제외

/* 유튜브는 봇 티가 나는 UA(예: "compatible; XxxBot/1.0")엔 404를 준다. 평범한 브라우저 UA로 요청할 것. */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8', 'Cookie': 'CONSENT=YES+1' };

/* 두 소스가 모두 막혔을 때의 안전망 — 모두 롱폼 믹스 */
const FALLBACK = [
  { id: '9E40d1donW4', label: '분위기 좋은 편집샵 재즈 힙합 🎷' },
  { id: 'N7XS4HasGk4', label: 'Late Night Jazz Hip Hop ☕' },
  { id: 'bAQlnYFfscE', label: 'Smooth R&B & Soul Mix' },
  { id: 'uVDR99PBFlg', label: '위험하게 분위기 좋은 둠칫 플리' },
  { id: 'G5PYccAFx3A', label: '걷다가 기분 좋아지는 도시팝 🚦' }
];

function decodeEntities(s) {
  return String(s)
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

/* "1:20:43" · "40:56" → 초. 형식이 아니면 0 */
function toSeconds(badge) {
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(String(badge || '').trim())) return 0;
  return String(badge).trim().split(':').reduce((acc, n) => acc * 60 + Number(n), 0);
}

/* 페이지에 박혀 있는 ytInitialData 객체만 잘라낸다 (괄호 균형으로 끝 찾기) */
function extractInitialData(html) {
  const key = html.indexOf('ytInitialData');
  if (key < 0) throw new Error('no ytInitialData');
  const start = html.indexOf('{', html.indexOf('=', key));
  let depth = 0, inStr = false, esc = false;
  for (let p = start; p < html.length; p++) {
    const c = html[p];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(start, p + 1));
  }
  throw new Error('unbalanced ytInitialData');
}

/* 1차: 채널 '동영상' 탭 — 쇼츠는 별도 탭이라 애초에 안 들어온다 */
async function fromVideosTab() {
  const res = await fetch(VIDEOS_TAB, { headers: HEADERS });
  if (!res.ok) throw new Error('videos tab ' + res.status);
  const data = extractInitialData(await res.text());

  const found = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const lv = node.lockupViewModel;
    if (lv && lv.contentId && lv.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      let title = null, badge = null;
      (function inner(x) {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) { x.forEach(inner); return; }
        const meta = x.lockupMetadataViewModel;
        if (meta && meta.title && meta.title.content && !title) title = meta.title.content;
        const b = x.thumbnailBadgeViewModel;
        if (b && b.text && !badge) badge = b.text;
        Object.values(x).forEach(inner);
      })(lv);
      found.push({ id: lv.contentId, title, badge });
    }
    Object.values(node).forEach(walk);
  })(data);

  return found
    .filter(v => toSeconds(v.badge) >= MIN_SECONDS)   // 쇼츠·초단편 제외
    .map(v => ({ id: v.id, label: cleanLabel(v.title || '') }));
}

/* 2차: 채널 RSS — link href 가 /shorts/ 면 쇼츠. 다만 RSS는 최근 15개뿐이라
   이 채널처럼 쇼츠를 자주 올리면 롱폼이 1~2개밖에 안 걸린다. 그래서 보조로만 쓴다. */
async function fromRss() {
  const res = await fetch(RSS, { headers: HEADERS });
  if (!res.ok) throw new Error('rss ' + res.status);
  const xml = await res.text();

  const out = [];
  for (const e of xml.match(/<entry>[\s\S]*?<\/entry>/g) || []) {
    const idM = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!idM) continue;
    const href = (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || [])[1] || '';
    if (href.includes('/shorts/')) continue;
    const label = cleanLabel((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    if (label) out.push({ id: idM[1], label });
  }
  return out;
}

/* 소스를 순서대로 시도해 합치고, 부족하면 폴백 롱폼으로 채운다 (중복 id 제거) */
async function collect() {
  const merged = [];
  const seen = new Set();
  const add = (list) => {
    for (const t of list) {
      if (!t || !t.id || !t.label || seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
      if (merged.length >= MAX) return;
    }
  };

  for (const source of [fromVideosTab, fromRss]) {
    if (merged.length >= MAX) break;
    try { add(await source()); } catch (e) { /* 다음 소스로 */ }
  }
  for (const f of FALLBACK) {
    if (merged.length >= 8) break;
    if (!seen.has(f.id)) { seen.add(f.id); merged.push(f); }
  }
  return merged.length ? merged : FALLBACK;
}

exports.handler = async () => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=1800, s-maxage=1800'  // 30분 캐시
  };
  try {
    return { statusCode: 200, headers, body: JSON.stringify(await collect()) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify(FALLBACK) };
  }
};
