import { MAP_W, MAP_H, PLAYER_SIZE } from './constants.js';
import { clamp, rand, getRadius, collidesWithBlock } from './math.js';

export const SPEED_PER_LEVEL = 0.02;

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function nearest(list, from, predicate = () => true) {
  let best = null;
  let bestDistance = Infinity;

  for (const item of list) {
    if (!item || !predicate(item)) continue;
    if (from?.kind === 'drop' && (item.bot || item.guard)) continue;
    const d = distance(from, item);
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }

  return best ? { item: best, distance: bestDistance } : null;
}

export function levelSpeed(tank, baseSpeed) {
  return baseSpeed * (1 + ((tank.level || 1) - 1) * SPEED_PER_LEVEL) * (tank.speedMul || 1);
}

export function safePosition(preferX = rand(420, MAP_W - 420), preferY = rand(420, MAP_H - 420), radius = 34) {
  const px = clamp(preferX, 420, MAP_W - 420);
  const py = clamp(preferY, 420, MAP_H - 420);

  if (!collidesWithBlock(px, py, radius)) return { x: px, y: py };

  for (let ring = 16; ring <= 220; ring += 18) {
    for (let step = 0; step < 16; step++) {
      const a = (Math.PI * 2 * step) / 16 + rand(-0.08, 0.08);
      const x = clamp(px + Math.cos(a) * ring, 420, MAP_W - 420);
      const y = clamp(py + Math.sin(a) * ring, 420, MAP_H - 420);
      if (!collidesWithBlock(x, y, radius)) return { x, y };
    }
  }

  for (let i = 0; i < 80; i++) {
    const x = clamp(px + rand(-420, 420), 420, MAP_W - 420);
    const y = clamp(py + rand(-420, 420), 420, MAP_H - 420);
    if (!collidesWithBlock(x, y, radius)) return { x, y };
  }

  for (let i = 0; i < 220; i++) {
    const x = rand(420, MAP_W - 420);
    const y = rand(420, MAP_H - 420);
    if (!collidesWithBlock(x, y, radius)) return { x, y };
  }

  return { x: 620, y: 620 };
}

export function moveTankSafe(tank, stepX, stepY) {
  const radius = getRadius(tank);
  let moved = false;

  const nextX = clamp(tank.x + stepX, PLAYER_SIZE, MAP_W - PLAYER_SIZE);
  if (!collidesWithBlock(nextX, tank.y, radius)) {
    tank.x = nextX;
    moved = moved || Math.abs(stepX) > 0.01;
  }

  const nextY = clamp(tank.y + stepY, PLAYER_SIZE, MAP_H - PLAYER_SIZE);
  if (!collidesWithBlock(tank.x, nextY, radius)) {
    tank.y = nextY;
    moved = moved || Math.abs(stepY) > 0.01;
  }

  return moved;
}

export function smartMove(tank, stepX, stepY) {
  if (moveTankSafe(tank, stepX, stepY)) return true;

  const angle = Math.atan2(stepY, stepX);
  const speed = Math.hypot(stepX, stepY);
  const variants = [
    angle + Math.PI / 2,
    angle - Math.PI / 2,
    angle + Math.PI / 4,
    angle - Math.PI / 4,
    angle + Math.PI
  ];

  for (const a of variants) {
    if (moveTankSafe(tank, Math.cos(a) * speed * 0.78, Math.sin(a) * speed * 0.78)) {
      tank.dir = a;
      return true;
    }
  }

  return false;
}

export function updateStuck(tank, now, moved) {
  const movedDistance = Math.hypot(tank.x - (tank.lastX || tank.x), tank.y - (tank.lastY || tank.y));

  if (!moved || movedDistance < 1.2) tank.stuck = (tank.stuck || 0) + 1;
  else tank.stuck = Math.max(0, (tank.stuck || 0) - 2);

  tank.lastX = tank.x;
  tank.lastY = tank.y;

  if (tank.stuck > 18) {
    tank.dir += rand(-1, 1) > 0 ? Math.PI / 2 : -Math.PI / 2;
    tank.nextTurn = now + 500;
    tank.stuck = 0;
  }
}
