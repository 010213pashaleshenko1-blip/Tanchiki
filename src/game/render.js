import { BLOCKS, MAP_W, MAP_H } from './constants.js';
import { getScale } from './math.js';

export function drawGround(ctx, cam) {
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  const sx = Math.floor(cam.x / 200) * 200;
  const ex = cam.x + cam.w + 240;
  const sy = Math.floor(cam.y / 200) * 200;
  const ey = cam.y + cam.h + 240;
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  ctx.lineWidth = 1;
  for (let x = sx; x <= ex; x += 200) { ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x, ey); ctx.stroke(); }
  for (let y = sy; y <= ey; y += 200) { ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(ex, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(34,197,94,.16)';
  for (let x = sx; x <= ex; x += 1000) { ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x, ey); ctx.stroke(); }
  for (let y = sy; y <= ey; y += 1000) { ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(ex, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(248,250,252,.35)';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, MAP_W, MAP_H);
}

export function drawBlocks(ctx) {
  ctx.fillStyle = '#253044';
  for (const [x, y, w, h] of BLOCKS) {
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.11)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
}

export function drawTank(ctx, p, isMe) {
  const scale = getScale(p);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = p.color || '#4ade80';
  ctx.strokeStyle = isMe ? '#fff' : (p.bot ? 'rgba(250,204,21,.8)' : 'rgba(255,255,255,.35)');
  ctx.lineWidth = isMe ? 3 : 2;
  ctx.fillRect(-18, -15, 36, 30);
  ctx.strokeRect(-18, -15, 36, 30);
  ctx.fillStyle = p.bot ? '#fde68a' : '#d1d5db';
  ctx.fillRect(0, -5, 38, 10);
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = p.bot ? '#facc15' : '#e5e7eb';
  ctx.font = '14px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`${p.name || 'tank'} LVL ${p.level || 1}`, p.x, p.y - 28 * scale);
}

export function drawBullet(ctx, b) {
  ctx.fillStyle = String(b.owner).startsWith('bot-') ? '#fb7185' : '#facc15';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawOrb(ctx, orb) {
  ctx.save();
  ctx.shadowColor = '#22c55e';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#86efac';
  ctx.beginPath();
  ctx.arc(orb.x, orb.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#052e16';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('+1', orb.x, orb.y + 3);
  ctx.restore();
}

export function drawMiniMap(ctx, w, h, me, peers, bots, orbs) {
  const s = Math.min(180, Math.max(128, h * 0.26));
  const x = w - s - 16;
  const y = 70;
  const sx = s / MAP_W;
  const sy = s / MAP_H;
  ctx.save();
  ctx.fillStyle = 'rgba(2,6,23,.76)';
  ctx.strokeStyle = 'rgba(255,255,255,.2)';
  ctx.lineWidth = 1;
  round(ctx, x, y, s, s, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  for (const [bx, by, bw, bh] of BLOCKS) ctx.fillRect(x + bx * sx, y + by * sy, Math.max(2, bw * sx), Math.max(2, bh * sy));
  for (const orb of orbs) { ctx.fillStyle = '#86efac'; ctx.beginPath(); ctx.arc(x + orb.x * sx, y + orb.y * sy, 2, 0, Math.PI * 2); ctx.fill(); }
  for (const p of peers.values()) { ctx.fillStyle = p.color || '#60a5fa'; ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.y * sy, 3, 0, Math.PI * 2); ctx.fill(); }
  for (const bot of bots) { ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(x + bot.x * sx, y + bot.y * sy, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + me.x * sx, y + me.y * sy, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '12px system-ui';
  ctx.fillText('MAP 1×1 KM', x + 10, y + s - 10);
  ctx.restore();
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
