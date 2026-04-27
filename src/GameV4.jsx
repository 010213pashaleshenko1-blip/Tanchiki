import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  MAP_W, MAP_H, PLAYER_SIZE, BULLET_RADIUS, SPEED, BOT_SPEED, FIRE_COOLDOWN, BOT_FIRE_COOLDOWN,
  PLAYER_TTL, JOYSTICK_RADIUS, MAX_PLAYERS_PER_ROOM, BOT_COUNT, MAX_LEVEL, ORBS_PER_KILL, ROOMS
} from './game/constants.js';
import { makeBots, respawnBot } from './game/bots.js';
import { clamp, rand, makeId, isMobileLike, getRadius, getMaxHp, getDamage, getScale, xpNeed, collidesWithBlock } from './game/math.js';
import { drawGround, drawBlocks, drawTank, drawBullet, drawMiniMap, drawOrb } from './game/render.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const XP_DROP_INTERVAL = 120000;
const XP_DROP_MIN = 15;
const XP_DROP_MAX = 100;
const GUARD_LEVEL = 10;
const GUARD_COUNT = 4;
const CENTER_X = MAP_W / 2;
const CENTER_Y = MAP_H / 2;

function createSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 30 } } });
}

function getDeathDropCount(level) {
  if (level >= 25) return 16;
  if (level >= 15) return 8;
  if (level >= 5) return 4;
  return ORBS_PER_KILL;
}

function getLevelLoss(level) {
  if (level <= 1) return 0;
  return Math.max(1, Math.floor(level * 0.1));
}

function getMoveSpeed(tank, baseSpeed) {
  return baseSpeed * (1 + ((tank.level || 1) - 1) * 0.15);
}

function makeGuard(crateId, index) {
  const angle = (Math.PI * 2 / GUARD_COUNT) * index;
  const dist = 260;
  return {
    id: `guard-${crateId}-${index}`,
    name: `Guard ${index + 1}`,
    bot: true,
    guard: true,
    level: GUARD_LEVEL,
    x: CENTER_X + Math.cos(angle) * dist,
    y: CENTER_Y + Math.sin(angle) * dist,
    angle,
    hp: getMaxHp({ level: GUARD_LEVEL }),
    color: '#ef4444',
    dir: angle,
    nextTurn: performance.now() + rand(600, 1400),
    lastFire: performance.now() + rand(0, BOT_FIRE_COOLDOWN)
  };
}

function makeGuards(crateId) {
  return Array.from({ length: GUARD_COUNT }, (_, i) => makeGuard(crateId, i));
}

export default function App() {
  const supabase = useMemo(createSupabase, []);
  const [name, setName] = useState(localStorage.getItem('tank_name') || `Tank${Math.floor(rand(100, 999))}`);
  const [room, setRoom] = useState(localStorage.getItem('tank_room') || ROOMS[0]);
  const [joined, setJoined] = useState(false);

  if (!supabase) return <ConfigMissing />;

  return <div className="app">{!joined ? <Lobby name={name} setName={setName} room={room} setRoom={setRoom} onJoin={() => {
    const safeRoom = ROOMS.includes(room) ? room : ROOMS[0];
    localStorage.setItem('tank_name', name.trim() || 'Player');
    localStorage.setItem('tank_room', safeRoom);
    setRoom(safeRoom);
    setJoined(true);
  }} /> : <Game supabase={supabase} playerName={name.trim() || 'Player'} roomCode={room} onLeave={() => setJoined(false)} />}</div>;
}

function ConfigMissing() {
  return <div className="centerCard"><h1>Нужен Supabase</h1><p>Заполни <b>.env</b>: VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.</p><p className="muted">После этого перезапусти dev server или redeploy на Vercel.</p></div>;
}

function Lobby({ name, setName, room, setRoom, onJoin }) {
  return <div className="lobby"><div className="panel hero"><div className="badge">CENTER DROP / 4 GUARDS</div><h1>Tanchiki Online</h1><p>XP-дроп теперь падает в центре карты. Его охраняют 4 врага 10 уровня с одной жизнью и двойным XP-дропом.</p></div><div className="panel form"><label>Ник</label><input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} /><label>Комната</label><div className="roomGrid">{ROOMS.map((code, i) => <button key={code} type="button" className={`roomButton ${room === code ? 'active' : ''}`} onClick={() => setRoom(code)}>Комната {i + 1}<span>до {MAX_PLAYERS_PER_ROOM} игроков + {BOT_COUNT} ботов</span></button>)}</div><button onClick={onJoin}>Войти в бой</button><p className="muted">На мини-карте центр отмечается голубым дропом и красными охранниками.</p></div></div>;
}

function Game({ supabase, playerName, roomCode, onLeave }) {
  const canvasRef = useRef(null);
  const joyRef = useRef(null);
  const knobRef = useRef(null);
  const keys = useRef(new Set());
  const pointer = useRef({ x: 5000, y: 5000, down: false });
  const aimTouchId = useRef(null);
  const camera = useRef({ x: 0, y: 0, w: 1, h: 1 });
  const joy = useRef({ id: null, dx: 0, dy: 0 });
  const me = useRef({ id: makeId(), name: playerName, level: 1, xp: 0, x: rand(400, MAP_W - 400), y: rand(400, MAP_H - 400), angle: 0, hp: 100, kills: 0, deaths: 0, lastFire: 0, color: `hsl(${Math.floor(rand(0, 360))} 80% 58%)` });
  const bots = useRef(makeBots(roomCode));
  const guards = useRef([]);
  const peers = useRef(new Map());
  const bullets = useRef([]);
  const orbs = useRef([]);
  const channelRef = useRef(null);
  const nextCrateAt = useRef(performance.now() + XP_DROP_INTERVAL);
  const [status, setStatus] = useState('Подключение...');
  const [playersCount, setPlayersCount] = useState(1);
  const [ui, setUi] = useState({ hp: 100, level: 1, xp: 0, nextDrop: 120 });
  const [mobile, setMobile] = useState(isMobileLike());
  const [portrait, setPortrait] = useState(innerHeight > innerWidth && isMobileLike());

  const syncUi = () => setUi({ hp: me.current.hp, level: me.current.level, xp: me.current.xp, nextDrop: Math.max(0, Math.ceil((nextCrateAt.current - performance.now()) / 1000)) });

  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      if (innerHeight > innerWidth) await screen.orientation?.lock?.('landscape');
      setPortrait(innerHeight > innerWidth && isMobileLike());
    } catch { setPortrait(innerHeight > innerWidth && isMobileLike()); }
  };

  const leaveToMenu = async () => {
    try { await screen.orientation?.lock?.('portrait'); } catch {}
    try { if (document.fullscreenElement) await document.exitFullscreen?.(); } catch {}
    try { screen.orientation?.unlock?.(); } catch {}
    onLeave();
  };

  useEffect(() => {
    const updateScreen = () => { setMobile(isMobileLike()); setPortrait(innerHeight > innerWidth && isMobileLike()); };
    updateScreen();
    addEventListener('resize', updateScreen);
    addEventListener('orientationchange', updateScreen);
    document.addEventListener('fullscreenchange', updateScreen);
    return () => { removeEventListener('resize', updateScreen); removeEventListener('orientationchange', updateScreen); document.removeEventListener('fullscreenchange', updateScreen); };
  }, []);

  useEffect(() => {
    const channel = supabase.channel(`tanchiki:${roomCode}`, { config: { broadcast: { self: false }, presence: { key: me.current.id } } });
    channelRef.current = channel;
    channel.on('broadcast', { event: 'state' }, ({ payload }) => { if (payload && payload.id !== me.current.id) peers.current.set(payload.id, { ...payload, seenAt: performance.now() }); });
    channel.on('broadcast', { event: 'shot' }, ({ payload }) => { if (payload && payload.owner !== me.current.id) bullets.current.push({ ...payload, born: performance.now() }); });
    channel.on('broadcast', { event: 'hit' }, ({ payload }) => { if (payload?.target === me.current.id) damageMe(payload.damage || 25); });
    channel.on('broadcast', { event: 'crate' }, ({ payload }) => {
      if (!payload?.id) return;
      if (!orbs.current.some((o) => o.id === payload.id)) orbs.current.push(payload);
      guards.current = makeGuards(payload.id);
    });
    channel.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await channel.track({ id: me.current.id, name: playerName, online_at: new Date().toISOString() });
        setStatus('Онлайн');
        setTimeout(() => { if (Object.keys(channel.presenceState()).length > MAX_PLAYERS_PER_ROOM) { alert(`Комната заполнена: максимум ${MAX_PLAYERS_PER_ROOM} игроков.`); leaveToMenu(); } }, 900);
      }
    });
    return () => channel.unsubscribe();
  }, [supabase, roomCode, playerName]);

  useEffect(() => {
    const down = (e) => keys.current.add(e.key.toLowerCase());
    const up = (e) => keys.current.delete(e.key.toLowerCase());
    addEventListener('keydown', down); addEventListener('keyup', up);
    const uiTimer = setInterval(syncUi, 500);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); clearInterval(uiTimer); };
  }, []);

  useEffect(() => {
    const base = joyRef.current, knob = knobRef.current;
    if (!base || !knob) return;
    const setStick = (x, y) => {
      const r = base.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const rx = x - cx, ry = y - cy, d = Math.hypot(rx, ry), a = Math.atan2(ry, rx), lim = Math.min(d, JOYSTICK_RADIUS);
      joy.current.dx = d > 4 ? Math.cos(a) * lim / JOYSTICK_RADIUS : 0;
      joy.current.dy = d > 4 ? Math.sin(a) * lim / JOYSTICK_RADIUS : 0;
      knob.style.transform = `translate3d(${joy.current.dx * JOYSTICK_RADIUS}px, ${joy.current.dy * JOYSTICK_RADIUS}px, 0)`;
    };
    const reset = () => { joy.current = { id: null, dx: 0, dy: 0 }; knob.style.transform = 'translate3d(0,0,0)'; };
    const block = (e) => { e.preventDefault(); e.stopPropagation(); };
    const down = (e) => { block(e); joy.current.id = e.pointerId; base.setPointerCapture?.(e.pointerId); setStick(e.clientX, e.clientY); };
    const move = (e) => { if (joy.current.id !== e.pointerId) return; block(e); setStick(e.clientX, e.clientY); };
    const up = (e) => { if (joy.current.id !== e.pointerId) return; block(e); reset(); };
    base.addEventListener('pointerdown', down); base.addEventListener('pointermove', move); base.addEventListener('pointerup', up); base.addEventListener('pointercancel', up);
    return () => { base.removeEventListener('pointerdown', down); base.removeEventListener('pointermove', move); base.removeEventListener('pointerup', up); base.removeEventListener('pointercancel', up); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    let last = performance.now(), sendTimer = 0, raf = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2.5);
      const w = Math.max(1, Math.floor(r.width * dpr)), h = Math.max(1, Math.floor(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      camera.current.w = r.width; camera.current.h = r.height;
    };
    const toWorld = (clientX, clientY) => { const r = canvas.getBoundingClientRect(); return { x: camera.current.x + clientX - r.left, y: camera.current.y + clientY - r.top }; };
    const touchById = (touches, id) => { for (const t of touches) if (t.identifier === id) return t; return null; };
    const setAim = (point) => { if (point) pointer.current = { ...pointer.current, ...toWorld(point.clientX, point.clientY) }; };
    const moveAim = (e) => { if (e.changedTouches) { const t = touchById(e.changedTouches, aimTouchId.current); if (t) setAim(t); } else setAim(e); };
    const aimDown = (e) => { if (e.target.closest?.('.joystick, .fireButton, .topbar')) return; if (e.changedTouches) { const t = e.changedTouches[0]; aimTouchId.current = t.identifier; setAim(t); } else setAim(e); pointer.current.down = true; fire(); };
    const aimUp = (e) => { if (e.changedTouches && aimTouchId.current !== null) { const t = touchById(e.changedTouches, aimTouchId.current); if (!t) return; aimTouchId.current = null; } pointer.current.down = false; };
    const fire = () => {
      const now = performance.now();
      if (now - me.current.lastFire < FIRE_COOLDOWN || me.current.hp <= 0) return;
      me.current.lastFire = now;
      const s = getScale(me.current);
      const b = { id: makeId(), owner: me.current.id, damage: getDamage(me.current, 34), x: me.current.x + Math.cos(me.current.angle) * 32 * s, y: me.current.y + Math.sin(me.current.angle) * 32 * s, vx: Math.cos(me.current.angle) * 620, vy: Math.sin(me.current.angle) * 620 };
      bullets.current.push({ ...b, born: now });
      channelRef.current?.send({ type: 'broadcast', event: 'shot', payload: b });
    };
    const loop = (now) => {
      resize();
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      update(dt, now, fire); updateCamera(); draw(ctx, canvas);
      sendTimer += dt;
      if (sendTimer > 0.06) { sendTimer = 0; channelRef.current?.send({ type: 'broadcast', event: 'state', payload: { ...me.current } }); }
      raf = requestAnimationFrame(loop);
    };
    canvas.addEventListener('mousemove', moveAim); canvas.addEventListener('mousedown', aimDown); canvas.addEventListener('touchstart', aimDown, { passive: true }); canvas.addEventListener('touchmove', moveAim, { passive: true });
    addEventListener('mouseup', aimUp); addEventListener('touchend', aimUp); addEventListener('touchcancel', aimUp);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener('mousemove', moveAim); canvas.removeEventListener('mousedown', aimDown); canvas.removeEventListener('touchstart', aimDown); canvas.removeEventListener('touchmove', moveAim); removeEventListener('mouseup', aimUp); removeEventListener('touchend', aimUp); removeEventListener('touchcancel', aimUp); };
  }, []);

  const spawnXpCrate = (broadcast = true) => {
    const crate = { id: `crate-${roomCode}-${makeId()}`, kind: 'drop', x: CENTER_X, y: CENTER_Y, value: Math.floor(rand(XP_DROP_MIN, XP_DROP_MAX + 1)), born: performance.now() };
    orbs.current = orbs.current.filter((o) => o.kind !== 'drop');
    orbs.current.push(crate);
    guards.current = makeGuards(crate.id);
    if (broadcast) channelRef.current?.send({ type: 'broadcast', event: 'crate', payload: crate });
  };

  const loseLevelsOnDeath = () => {
    const loss = getLevelLoss(me.current.level);
    if (loss <= 0) return;
    me.current.level = Math.max(1, me.current.level - loss);
    me.current.xp = Math.min(me.current.xp, Math.max(0, xpNeed(me.current.level) - 1));
  };

  const damageMe = (amount) => {
    me.current.hp = Math.max(0, me.current.hp - amount);
    syncUi();
    if (me.current.hp <= 0) {
      const deathX = me.current.x;
      const deathY = me.current.y;
      dropXpOrbs(deathX, deathY, getDeathDropCount(me.current.level));
      loseLevelsOnDeath();
      me.current.deaths += 1;
      me.current.x = rand(400, MAP_W - 400);
      me.current.y = rand(400, MAP_H - 400);
      me.current.hp = getMaxHp(me.current);
      setTimeout(syncUi, 350);
    }
  };

  const addXp = (amount) => {
    const p = me.current;
    p.xp += amount;
    while (p.level < MAX_LEVEL && p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level += 1; p.hp = getMaxHp(p); }
    if (p.level >= MAX_LEVEL) p.xp = 0;
    syncUi();
  };

  const dropXpOrbs = (x, y, count = ORBS_PER_KILL) => {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), d = rand(24, 78);
      orbs.current.push({ id: makeId(), kind: 'orb', x: clamp(x + Math.cos(a) * d, 20, MAP_W - 20), y: clamp(y + Math.sin(a) * d, 20, MAP_H - 20), value: 1, born: performance.now() });
    }
  };

  const update = (dt, now, fire) => {
    if (now >= nextCrateAt.current) {
      spawnXpCrate(true);
      nextCrateAt.current = now + XP_DROP_INTERVAL;
    }
    updatePlayer(dt, fire); updateBots(dt, now); updateGuards(dt, now); collectOrbs();
    for (const [id, p] of peers.current) if (now - p.seenAt > PLAYER_TTL) peers.current.delete(id);
    setPlayersCount(peers.current.size + 1);
    bullets.current = bullets.current.map((b) => ({ ...b, x: b.x + b.vx * dt, y: b.y + b.vy * dt })).filter((b) => now - b.born < 2200 && b.x > -80 && b.x < MAP_W + 80 && b.y > -80 && b.y < MAP_H + 80 && !collidesWithBlock(b.x, b.y, BULLET_RADIUS));
    for (const b of bullets.current) {
      if (b.owner === me.current.id) {
        for (const p of peers.current.values()) if (Math.hypot(b.x - p.x, b.y - p.y) < 25) { channelRef.current?.send({ type: 'broadcast', event: 'hit', payload: { target: p.id, from: me.current.id, damage: b.damage || getDamage(me.current, 34) } }); b.born = 0; }
        for (const bot of bots.current) if (bot.hp > 0 && Math.hypot(b.x - bot.x, b.y - bot.y) < getRadius(bot) + 8) { bot.hp -= b.damage || getDamage(me.current, 34); b.born = 0; if (bot.hp <= 0) { me.current.kills += 1; dropXpOrbs(bot.x, bot.y, getDeathDropCount(bot.level)); respawnBot(bot); } }
        for (const guard of guards.current) if (guard.hp > 0 && Math.hypot(b.x - guard.x, b.y - guard.y) < getRadius(guard) + 8) { guard.hp -= b.damage || getDamage(me.current, 34); b.born = 0; if (guard.hp <= 0) { me.current.kills += 1; dropXpOrbs(guard.x, guard.y, getDeathDropCount(guard.level) * 2); } }
        guards.current = guards.current.filter((g) => g.hp > 0);
      } else if ((String(b.owner).startsWith('bot-') || String(b.owner).startsWith('guard-')) && Math.hypot(b.x - me.current.x, b.y - me.current.y) < getRadius(me.current) + 8) { b.born = 0; damageMe(b.damage || 15); }
    }
  };

  const collectOrbs = () => {
    const radius = getRadius(me.current) + 24;
    const keep = [];
    for (const orb of orbs.current) {
      const pickupRadius = orb.kind === 'drop' ? radius + 36 : radius;
      if (Math.hypot(orb.x - me.current.x, orb.y - me.current.y) <= pickupRadius) addXp(orb.value);
      else keep.push(orb);
    }
    orbs.current = keep;
  };

  const updatePlayer = (dt, fire) => {
    let dx = joy.current.dx, dy = joy.current.dy;
    const k = keys.current;
    if (k.has('w') || k.has('arrowup')) dy -= 1; if (k.has('s') || k.has('arrowdown')) dy += 1; if (k.has('a') || k.has('arrowleft')) dx -= 1; if (k.has('d') || k.has('arrowright')) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
      const moveSpeed = getMoveSpeed(me.current, SPEED);
      moveTank(me.current, dx / len * moveSpeed * clamp(len, 0, 1) * dt, dy / len * moveSpeed * clamp(len, 0, 1) * dt);
    }
    me.current.angle = Math.atan2(pointer.current.y - me.current.y, pointer.current.x - me.current.x);
    if (pointer.current.down) fire();
  };

  const updateBots = (dt, now) => {
    for (const bot of bots.current) {
      const dist = Math.hypot(me.current.x - bot.x, me.current.y - bot.y);
      if (now > bot.nextTurn) { bot.dir = dist < 1300 ? Math.atan2(me.current.y - bot.y, me.current.x - bot.x) + rand(-0.8, 0.8) : rand(0, Math.PI * 2); bot.nextTurn = now + rand(900, 2400); }
      const botSpeed = getMoveSpeed(bot, BOT_SPEED);
      moveTank(bot, Math.cos(bot.dir) * botSpeed * dt, Math.sin(bot.dir) * botSpeed * dt);
      bot.angle = dist < 1500 ? Math.atan2(me.current.y - bot.y, me.current.x - bot.x) : bot.dir;
      if (dist < 1400 && now - bot.lastFire > BOT_FIRE_COOLDOWN) shootEnemy(bot, now);
    }
  };

  const updateGuards = (dt, now) => {
    for (const guard of guards.current) {
      const dist = Math.hypot(me.current.x - guard.x, me.current.y - guard.y);
      if (now > guard.nextTurn) {
        guard.dir = dist < 1600 ? Math.atan2(me.current.y - guard.y, me.current.x - guard.x) + rand(-0.35, 0.35) : Math.atan2(CENTER_Y - guard.y, CENTER_X - guard.x) + rand(-0.8, 0.8);
        guard.nextTurn = now + rand(600, 1400);
      }
      const guardSpeed = getMoveSpeed(guard, BOT_SPEED * 0.82);
      if (dist > 360) moveTank(guard, Math.cos(guard.dir) * guardSpeed * dt, Math.sin(guard.dir) * guardSpeed * dt);
      guard.angle = dist < 1700 ? Math.atan2(me.current.y - guard.y, me.current.x - guard.x) : guard.dir;
      if (dist < 1500 && now - guard.lastFire > BOT_FIRE_COOLDOWN * 0.9) shootEnemy(guard, now);
    }
  };

  const shootEnemy = (enemy, now) => {
    enemy.lastFire = now;
    const s = getScale(enemy);
    bullets.current.push({ id: makeId(), owner: enemy.id, damage: getDamage(enemy, enemy.guard ? 22 : 15), x: enemy.x + Math.cos(enemy.angle) * 32 * s, y: enemy.y + Math.sin(enemy.angle) * 32 * s, vx: Math.cos(enemy.angle) * 520, vy: Math.sin(enemy.angle) * 520, born: now });
  };

  const moveTank = (tank, stepX, stepY) => {
    const radius = getRadius(tank);
    const nextX = clamp(tank.x + stepX, PLAYER_SIZE, MAP_W - PLAYER_SIZE);
    if (!collidesWithBlock(nextX, tank.y, radius)) tank.x = nextX; else tank.dir = rand(0, Math.PI * 2);
    const nextY = clamp(tank.y + stepY, PLAYER_SIZE, MAP_H - PLAYER_SIZE);
    if (!collidesWithBlock(tank.x, nextY, radius)) tank.y = nextY; else tank.dir = rand(0, Math.PI * 2);
  };

  const updateCamera = () => {
    const c = camera.current;
    const tx = clamp(me.current.x - c.w / 2, 0, Math.max(0, MAP_W - c.w));
    const ty = clamp(me.current.y - c.h / 2, 0, Math.max(0, MAP_H - c.h));
    c.x += (tx - c.x) * 0.12; c.y += (ty - c.y) * 0.12;
  };

  const draw = (ctx, canvas) => {
    const r = canvas.getBoundingClientRect();
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, r.width, r.height);
    ctx.save(); ctx.translate(-Math.round(camera.current.x), -Math.round(camera.current.y));
    drawGround(ctx, camera.current); drawBlocks(ctx);
    for (const orb of orbs.current) drawOrb(ctx, orb);
    for (const p of peers.current.values()) drawTank(ctx, p, false);
    for (const bot of bots.current) drawTank(ctx, bot, false);
    for (const guard of guards.current) drawTank(ctx, guard, false);
    drawTank(ctx, me.current, true);
    for (const b of bullets.current) drawBullet(ctx, b);
    ctx.restore();
    drawMiniMap(ctx, r.width, r.height, me.current, peers.current, [...bots.current, ...guards.current], orbs.current);
  };

  return <div className="gameShell">{mobile && portrait && <div className="portraitBlocker"><div>Переверните телефон</div><small>Или нажмите кнопку ниже — игра откроется на весь экран и попробует повернуть экран.</small><button onClick={enterFullscreen}>На весь экран и повернуть</button></div>}<header className="topbar"><div><b>Tanchiki</b> / room: <code>{roomCode}</code></div><div className="stats"><span>{status}</span><span>Игроков: {playersCount}/{MAX_PLAYERS_PER_ROOM}</span><span>LVL: {ui.level}/{MAX_LEVEL}</span><span>XP: {ui.level >= MAX_LEVEL ? 'MAX' : `${ui.xp}/${xpNeed(ui.level)}`}</span><span>HP: {ui.hp}/{getMaxHp(me.current)}</span><span>DROP: center / {ui.nextDrop}s</span><span>GUARDS: {guards.current.length}</span></div><button className="small" onClick={leaveToMenu}>Выйти</button></header><canvas ref={canvasRef} className="gameCanvas" /><div className="joystick" ref={joyRef}><div className="joystickRing" /><div className="joystickKnob" ref={knobRef} /></div><button className="fireButton" onPointerDown={(e) => { e.stopPropagation(); pointer.current.down = true; }} onPointerUp={(e) => { e.stopPropagation(); pointer.current.down = false; }} onPointerCancel={(e) => { e.stopPropagation(); pointer.current.down = false; }}>FIRE</button></div>;
}
