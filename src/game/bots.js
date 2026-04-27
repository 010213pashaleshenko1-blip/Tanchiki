import { BOT_COUNT, BOT_FIRE_COOLDOWN, MAX_LEVEL, ROOMS, MAP_W, MAP_H } from './constants.js';
import { clamp, rand, getMaxHp } from './math.js';

export function makeBots(roomCode) {
  const roomIndex = Math.max(0, ROOMS.indexOf(roomCode));
  return Array.from({ length: BOT_COUNT }, (_, i) => {
    const level = clamp(1 + roomIndex * 2 + i, 1, MAX_LEVEL);
    return {
      id: `bot-${roomCode}-${i}`,
      name: `Bot ${i + 1}`,
      bot: true,
      level,
      x: 1200 + i * 1450 + roomIndex * 120,
      y: 1300 + ((i * 1730 + roomIndex * 700) % 7200),
      angle: 0,
      hp: 100 + (level - 1) * 25,
      color: `hsl(${(roomIndex * 55 + i * 48) % 360} 75% 58%)`,
      dir: rand(0, Math.PI * 2),
      nextTurn: performance.now() + rand(900, 2500),
      lastFire: performance.now() + rand(0, BOT_FIRE_COOLDOWN)
    };
  });
}

export function respawnBot(bot) {
  bot.level = clamp((bot.level || 1) + 1, 1, MAX_LEVEL);
  bot.x = rand(400, MAP_W - 400);
  bot.y = rand(400, MAP_H - 400);
  bot.hp = getMaxHp(bot);
  bot.dir = rand(0, Math.PI * 2);
  bot.nextTurn = performance.now() + rand(900, 2500);
}
