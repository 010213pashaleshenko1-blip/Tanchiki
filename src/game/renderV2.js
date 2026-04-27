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
  const special = Boolean(p.special);
  const body = special ? '#7c2d12' : (p.color || '#4ade80');
  const accent = special ? '#ef4444' : (p.guard ? '#f87171' : (p.bot ? '#facc15' : '#d1d5db'));
  const outline = special ? '#f97316' : (isMe ? '#ffffff' : (p.guard ? 'rgba(248,113,113,.95)' : (p.bot ? 'rgba(250,204,21,.88)' : 'rgba(255,255,255,.38)')));

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.scale(scale, scale);
  ctx.lineWidth = isMe || special ? 3 : 2;
  ctx.strokeStyle = outline;
  if (special) { ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 18; }
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  roundRect(ctx, -24, -20, 44, 40, 8); ctx.fill();
  ctx.fillStyle = '#111827';
  roundRect(ctx, -25, -18, 14, 36, 5); ctx.fill();
  roundRect(ctx, 9, -18, 14, 36, 5); ctx.fill();
  ctx.fillStyle = special ? '#991b1b' : '#374151';
  for (let y = -13; y <= 13; y += 8) { ctx.fillRect(-24, y, 12, 3); ctx.fillRect(10, y, 12, 3); }
  ctx.fillStyle = body;
  roundRect(ctx, -19, -15, 38, 30, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = special ? 'rgba(254,202,202,.28)' : 'rgba(255,255,255,.16)';
  ctx.fillRect(-10, -11, 20, 5); ctx.fillRect(-12, 7, 24, 4);
  ctx.fillStyle = accent;
  roundRect(ctx, -7, -9, 16, 18, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = special ? '#fb7185' : (p.guard ? '#f87171' : (p.bot ? '#fbbf24' : '#e5e7eb'));
  roundRect(ctx, 4, -4, 44, 8, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#111827'; ctx.fillRect(44, -3, 7, 6);
  if (special) {
    ctx.fillStyle = '#fecaca';
    ctx.beginPath(); ctx.moveTo(-13, -16); ctx.lineTo(-5, -27); ctx.lineTo(0, -15); ctx.fill();
    ctx.beginPath(); ctx.moveTo(13, -16); ctx.lineTo(5, -27); ctx.lineTo(0, -15); ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = special ? '#fb7185' : (p.guard ? '#f87171' : (p.bot ? '#facc15' : '#e5e7eb'));
  ctx.font = special ? 'bold 14px system-ui' : '14px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`${p.name || 'tank'} LVL ${p.level || 1}`, p.x, p.y - 31 * scale);
}

export function drawBullet(ctx, b) {
  const isEnemy = String(b.owner).startsWith('bot-') || String(b.owner).startsWith('guard-');
  ctx.save();
  ctx.shadowColor = isEnemy ? '#fb7185' : '#facc15';
  ctx.shadowBlur = 8;
  ctx.fillStyle = isEnemy ? '#fb7185' : '#facc15';
  ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawOrb(ctx, orb) {
  ctx.save();
  const isDrop = orb.kind === 'drop';
  ctx.shadowColor = isDrop ? '#38bdf8' : '#22c55e';
  ctx.shadowBlur = isDrop ? 30 : 14;
  if (isDrop) {
    ctx.translate(orb.x, orb.y);
    ctx.rotate((performance.now() / 700) % (Math.PI * 2));
    ctx.fillStyle = '#0ea5e9'; roundRect(ctx, -24, -24, 48, 48, 10); ctx.fill();
    ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#e0f2fe'; ctx.fillRect(-4, -18, 8, 36); ctx.fillRect(-18, -4, 36, 8);
    ctx.rotate(-(performance.now() / 700) % (Math.PI * 2));
    ctx.fillStyle = '#e0f2fe'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`+${orb.value}`, 0, 38);
  } else {
    ctx.fillStyle = '#86efac'; ctx.beginPath(); ctx.arc(orb.x, orb.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#052e16'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`+${orb.value || 1}`, orb.x, orb.y + 3);
  }
  ctx.restore();
}

export function drawMiniMap(ctx, w, h, me, peers, bots, orbs) {
  const s = Math.min(180, Math.max(128, h * 0.26));
  const x = w - s - 16;
  const y = 70;
  const sx = s / MAP_W;
  const sy = s / MAP_H;
  ctx.save();
  ctx.fillStyle = 'rgba(2,6,23,.76)'; ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1;
  roundRect(ctx, x, y, s, s, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#64748b';
  for (const [bx, by, bw, bh] of BLOCKS) ctx.fillRect(x + bx * sx, y + by * sy, Math.max(2, bw * sx), Math.max(2, bh * sy));
  for (const orb of orbs) { ctx.fillStyle = orb.kind === 'drop' ? '#38bdf8' : '#86efac'; ctx.beginPath(); ctx.arc(x + orb.x * sx, y + orb.y * sy, orb.kind === 'drop' ? 5 : 2, 0, Math.PI * 2); ctx.fill(); }
  for (const p of peers.values()) { ctx.fillStyle = p.special ? '#fb7185' : (p.color || '#60a5fa'); ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.y * sy, 3, 0, Math.PI * 2); ctx.fill(); }
  for (const bot of bots) { ctx.fillStyle = bot.guard ? '#ef4444' : '#facc15'; ctx.beginPath(); ctx.arc(x + bot.x * sx, y + bot.y * sy, bot.guard ? 4 : 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = me.special ? '#fb7185' : '#fff';
  ctx.beginPath(); ctx.arc(x + me.x * sx, y + me.y * sy, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#cbd5e1'; ctx.font = '12px system-ui'; ctx.fillText('MAP 1×1 KM', x + 10, y + s - 10);
  ctx.restore();
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
