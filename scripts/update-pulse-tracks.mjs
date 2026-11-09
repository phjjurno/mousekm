/* ============================================================
   mousekm — PULSE ORIGIN 최신 롱폼 수집 (빌드 타임)
   채널 '동영상(/videos)' 탭을 읽어 롱폼만 골라
   data/pulse-tracks.json 으로 저장한다.
   GitHub Actions가 주기적으로 실행 → 변경 시 커밋 → Netlify 자동 배포.

   RSS(feeds/videos.xml)를 쓰지 않는 이유: 최근 15개만 담기는데 이 채널은
   그중 대부분이 쇼츠라 롱폼이 1~2개밖에 안 걸린다. 보조 소스로만 둔다.
   또 유튜브는 봇 티 나는 User-Agent(예: MousekmBot/1.0)에 404를 준다.
   ============================================================ */
import { writeFile, readFile } from 'node:fs/promises';

const CHANNEL_ID = 'UCLHwI49tTuxSIesBn_Zuv1w'; // @PULSEORIGN
const MAX = 12;
const MIN_SECONDS = 180;   // 3분 미만은 쇼츠·초단편으로 보고 제외
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8', 'Cookie': 'CONSENT=YES+1' };
const OUT = new URL('../data/pulse-tracks.json', import.meta.url);

/* 수집 실패 시 안전망 (기존 목록 유지가 우선, 그것도 없으면 이 값) */
const FALLBACK = [
  { id: '9E40d1donW4', label: '분위기 좋은 편집샵 재즈 힙합 🎷' },
  { id: 'N7XS4HasGk4', label: 'Late Night Jazz Hip Hop ☕' },
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
  // 유튜브 제목은 한글이 풀어쓴 자모(NFD)로 오기도 한다 → 먼저 NFC로 합쳐야
  // 글자 수가 제대로 세지고, 자른 자리에 'ᄀ' 같은 자모 조각이 남지 않는다
  let s = decodeEntities(t)
    .normalize('NFC')
    .replace(/⁽[^⁾]*⁾/g, ' ')        // ⁽ᴾˡᵃʸˡⁱˢᵗ⁾ 같은 위첨자 장식 제거
    .replace(/[#＃][^\s#＃]+/g, ' ')  // 해시태그 제거
    .replace(/[|｜·・]+/g, ' ')       // 구분자 정리
    .replace(/\s+/g, ' ')
    .trim();
  // 이모지·결합 문자가 반쪽 나지 않게 '보이는 글자(grapheme)' 단위로 자른다
  const chars = typeof Intl !== 'undefined' && Intl.Segmenter
    ? [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment)
    : [...s];
  if (chars.length > 40) s = chars.slice(0, 39).join('').trim() + '…';
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
  const res = await fetch('https://www.youtube.com/@PULSEORIGN/videos', { headers: HEADERS });
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
        if (meta?.title?.content && !title) title = meta.title.content;
        if (x.thumbnailBadgeViewModel?.text && !badge) badge = x.thumbnailBadgeViewModel.text;
        Object.values(x).forEach(inner);
      })(lv);
      found.push({ id: lv.contentId, title, badge });
    }
    Object.values(node).forEach(walk);
  })(data);

  return found
    .filter((v) => toSeconds(v.badge) >= MIN_SECONDS)
    .map((v) => ({ id: v.id, label: cleanLabel(v.title || '') }));
}

/* 2차: 채널 RSS — link href 가 /shorts/ 면 쇼츠 */
async function fromRss() {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { headers: HEADERS });
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

async function collect() {
  const merged = [];
  const seen = new Set();
  for (const source of [fromVideosTab, fromRss]) {
    if (merged.length >= MAX) break;
    try {
      for (const t of await source()) {
        if (!t?.id || !t.label || seen.has(t.id)) continue;
        seen.add(t.id);
        merged.push(t);
        if (merged.length >= MAX) break;
      }
    } catch (e) { console.error('소스 실패:', e.message); }
  }
  if (!merged.length) throw new Error('롱폼을 하나도 찾지 못함');
  return merged;
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
