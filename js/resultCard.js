// 오늘의 결과 공유 카드 — 캔버스로 이미지 생성 (개인정보 미포함)
import { SHARE_LINES } from './titles.js?v=5';
import { START_NAME } from './routes.js?v=5';

export const CARD_SIZES = {
  square: { w: 1080, h: 1080, label: '정사각형 1080×1080' },
  story:  { w: 1080, h: 1920, label: '스토리 1080×1920' },
  wide:   { w: 1200, h: 630,  label: '가로형 1200×630' },
};

export function pickShareLine(data, dateKey) {
  let h = 0;
  for (const c of dateKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const line = SHARE_LINES[h % SHARE_LINES.length];
  return line
    .replace('{dest}', data.toName)
    .replace('{keys}', data.keyCount.toLocaleString());
}

// data: { fromName, toName, travelKm, keyCount, clickCount, mouseKm, activeText, title }
export function drawResultCard(canvas, data, sizeKey = 'square') {
  const { w, h } = CARD_SIZES[sizeKey];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const cx = w / 2;

  // 배경
  ctx.fillStyle = '#F7F6F3';
  ctx.fillRect(0, 0, w, h);

  // 카드 프레임
  const pad = Math.round(w * 0.055);
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 28);
  ctx.fill();
  ctx.strokeStyle = '#E9E9E7';
  ctx.lineWidth = 2;
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 28);
  ctx.stroke();

  const font = (weight, size) => `${weight} ${size}px Inter, 'Apple SD Gothic Neo', sans-serif`;
  ctx.textAlign = 'center';

  // 세로 배치 좌표 (비율별 보정)
  const top = pad + (sizeKey === 'story' ? h * 0.10 : h * 0.06);
  const scale = sizeKey === 'wide' ? 0.72 : 1;

  // 로고
  ctx.fillStyle = '#2383E2';
  ctx.font = font(700, 44 * scale);
  ctx.fillText('mousekm', cx, top);

  // 경로
  ctx.fillStyle = '#191919';
  ctx.font = font(700, 58 * scale);
  ctx.fillText(`${data.fromName} → ${data.toName}`, cx, top + 110 * scale);

  // 총 거리
  ctx.fillStyle = '#2383E2';
  ctx.font = font(700, 96 * scale);
  ctx.fillText(data.travelText, cx, top + 230 * scale);
  ctx.fillStyle = '#787774';
  ctx.font = font(500, 30 * scale);
  ctx.fillText('오늘의 손끝 거리 (모니터 크기 기준 실측 환산)', cx, top + 280 * scale);

  // 구분선
  const lineY = top + 330 * scale;
  ctx.strokeStyle = '#E9E9E7';
  ctx.beginPath();
  ctx.moveTo(pad + 60, lineY);
  ctx.lineTo(w - pad - 60, lineY);
  ctx.stroke();

  // 통계
  ctx.fillStyle = '#191919';
  ctx.font = font(500, 36 * scale);
  const stats = [
    `⌨ ${data.keyCount.toLocaleString()}타    👆 ${data.clickCount.toLocaleString()}회`,
    `🖱 ${data.mouseText}    ⏱ ${data.activeText}`,
  ];
  stats.forEach((s, i) => ctx.fillText(s, cx, lineY + (70 + i * 60) * scale));

  // 칭호
  ctx.fillStyle = '#787774';
  ctx.font = font(500, 28 * scale);
  ctx.fillText('오늘의 칭호', cx, lineY + 230 * scale);
  ctx.fillStyle = '#191919';
  ctx.font = font(700, 42 * scale);
  ctx.fillText(`「${data.title}」`, cx, lineY + 285 * scale);

  // 공유 문구
  ctx.fillStyle = '#787774';
  ctx.font = font(400, 27 * scale);
  ctx.fillText(data.shareLine, cx, h - pad - 50 * scale);
}

export function downloadCard(canvas, dateKey, sizeKey) {
  const a = document.createElement('a');
  a.download = `mousekm-${dateKey}-${sizeKey}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { START_NAME };
