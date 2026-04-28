import { MAX_LEVEL } from './constants.js';

export const BOT_LEVEL_MAX = 1000;

function xpNeedForBot(level) {
  return Math.max(1, level || 1);
}

function levelUpBot(bot, xp) {
  bot.xp = (bot.xp || 0) + xp;
  while ((bot.level || 1) < BOT_LEVEL_MAX && bot.xp >= xpNeedForBot(bot.level || 1)) {
    bot.xp -= xpNeedForBot(bot.level || 1);
    bot.level = (bot.level || 1) + 1;
    bot.hp = Math.max(bot.hp || 0, 100 + bot.level * 25);
  }
  if (bot.level >= BOT_LEVEL_MAX) {
    bot.level = BOT_LEVEL_MAX;
    bot.xp = 0;
  }
}

export function applyOfflineBotProgress(bots, updatedAt) {
  const then = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const ticks = Math.min(720, Math.floor(elapsedSeconds / 30));
  if (!ticks) return bots;

  return bots.map((bot, index) => {
    const copy = { ...bot, unlimitedLevel: true };
    const xpGain = ticks * (1 + (index % 3));
    levelUpBot(copy, xpGain);
    return copy;
  });
}

export async function loadRoomBots(supabase, roomCode, fallbackBots) {
  const { data, error } = await supabase
    .from('room_bot_state')
    .select('bots, updated_at')
    .eq('room_code', roomCode)
    .maybeSingle();

  if (error || !data?.bots?.length) return fallbackBots.map((bot) => ({ ...bot, unlimitedLevel: true }));
  return applyOfflineBotProgress(data.bots, data.updated_at);
}

export async function saveRoomBots(supabase, roomCode, bots) {
  const safeBots = bots.map((bot) => ({
    id: bot.id,
    name: bot.name,
    bot: true,
    unlimitedLevel: true,
    level: Math.min(BOT_LEVEL_MAX, bot.level || 1),
    xp: bot.xp || 0,
    x: bot.x,
    y: bot.y,
    angle: bot.angle || 0,
    dir: bot.dir || 0,
    hp: bot.hp || 100,
    color: bot.color,
    lastFire: 0,
    nextTurn: 0,
    stuck: 0,
    lastX: bot.x,
    lastY: bot.y
  }));

  await supabase
    .from('room_bot_state')
    .upsert({ room_code: roomCode, bots: safeBots, updated_at: new Date().toISOString() });
}

export function canBotLevel(bot) {
  return (bot.level || 1) < BOT_LEVEL_MAX;
}

export function botNeed(bot) {
  return Math.max(1, bot.level || 1);
}
