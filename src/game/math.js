import { BLOCKS, MAX_LEVEL, BASE_TANK_RADIUS } from './constants.js';

export const rand = (a, b) => Math.random() * (b - a) + a;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const makeId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
export const isMobileLike = () => matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function getScale(tank) {
  return 1 + ((tank.level || 1) - 1) * 0.035;
}

export function getRadius(tank) {
  return BASE_TANK_RADIUS * getScale(tank);
}

export function getMaxHp(tank) {
  return 100 + ((tank.level || 1) - 1) * 25;
}

export function getDamage(tank, base = 34) {
  return base + ((tank.level || 1) - 1) * 10;
}

export function xpNeed(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.max(1, level);
}

export function circleRectHit(cx, cy, radius, rect) {
  const [x, y, w, h] = rect;
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  return Math.hypot(cx - nx, cy - ny) < radius;
}

export function collidesWithBlock(x, y, radius) {
  return BLOCKS.some((block) => circleRectHit(x, y, radius, block));
}
