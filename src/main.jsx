import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const MAP_W = 10000;
const MAP_H = 10000;
const PLAYER_SIZE = 34;
const TANK_RADIUS = 22;
const BULLET_RADIUS = 5;
const SPEED = 260;
const BOT_SPEED = 190;
const FIRE_COOLDOWN = 420;
const BOT_FIRE_COOLDOWN = 1100;
const PLAYER_TTL = 2500;
const JOY_R = 54;
const MAX_PLAYERS_PER_ROOM = 50;
const BOT_COUNT = 5;
const ROOMS = ['room-1', 'room-2', 'room-3', 'room-4', 'room-5'];

const BLOCKS = [
  [780, 760, 520, 160], [1720, 1240, 220, 680], [2620, 820, 780, 210],
  [4180, 1450, 320, 880], [5480, 900, 980, 220], [7240, 680, 260, 760],
  [8480, 1450, 780, 240], [980, 3060, 900, 260], [2420, 2840, 260, 760],
  [3520, 3360, 760, 240], [5200, 2860, 340, 980], [6820, 3240, 880, 260],
  [8260, 2780, 320, 720], [1260, 5220, 700, 260], [2860, 4880, 320, 940],
  [4200, 5480, 980, 260], [6200, 4940, 300, 760], [7700, 5360, 1000, 240],
  [920, 7520, 800, 280], [2380, 6980, 280, 820], [3920, 7580, 760, 260],
  [5660, 7020, 320, 860], [7220, 7440, 980, 260], [8780, 6940, 300, 900]
];

const rand = (a, b) => Math.random() * (b - a) + a;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const makeId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
const isMobileLike = () => matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function createSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 30 } }
  });
}

function App() {
  const supabase = useMemo(createSupabase, []);
  const [name, setName] = useState(localStorage.getItem('tank_name') || `Tank${Math.floor(rand(100, 999))}`);
  const [room, setRoom] = useState(localStorage.getItem('tank_room') || ROOMS[0]);
  const [joined, setJoined] = useState(false);

  if (!supabase) return <ConfigMissing />;

  return (
    <div className="app">
      {!joined ? (
        <Lobby
          name={name}
          setName={setName}
          room={room}
          setRoom={setRoom}
          onJoin={() => {
            const safeRoom = ROOMS.includes(room) ? room : ROOMS[0];
            localStorage.setItem('tank_name', name.trim() || 'Player');
            localStorage.setItem('tank_room', safeRoom);
            setRoom(safeRoom);
            setJoined(true);
          }}
        />
      ) : (
        <Game supabase={supabase} playerName={name.trim() || 'Player'} roomCode={room} onLeave={() => setJoined(false)} />
      )}
    </div>
  );
}

function ConfigMissing() {
  return (
    <div className="centerCard">
      <h1>Нужен Supabase</h1>
      <p>Заполни <b>.env</b>: VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.</p>
      <p className="muted">После этого перезапусти dev server или redeploy на Vercel.</p>
    </div>
  );
}

function Lobby({ name, setName, room, setRoom, onJoin }) {
  return (
    <div className="lobby">
      <div className="panel hero">
        <div className="badge">5 ROOMS / 50 PLAYERS / 5 BOTS</div>
        <h1>Tanchiki Online</h1>
        <p>Выбирай одну из 5 комнат. В каждой комнате максимум 50 реальных танков и 5 ботов для веселья.</p>
      </div>
      <div className="panel form">
        <label>Ник</label>
        <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} />
        <label>Комната</label>
        <div className="roomGrid">
          {ROOMS.map((code, i) => (
            <button key={code} type="button" className={`roomButton ${room === code ? 'active' : ''}`} onClick={() => setRoom(code)}>
              Комната {i + 1}
              <span>до {MAX_PLAYERS_PER_ROOM} игроков + {BOT_COUNT} ботов</span>
            </button>
          ))}
        </div>
        <button onClick={onJoin}>Войти в бой</button>
        <p className="muted">На телефоне лучше играть горизонтально и на весь экран.</p>
      </div>
    </div>
  );
}

function makeBots(roomCode) {
  const roomIndex = Math.max(0, ROOMS.indexOf(roomCode));
  return Array.from({ length: BOT_COUNT }, (_, i) => {
    const x = 1200 + i * 1450 + roomIndex * 120;
    const y = 1300 + ((i * 1730 + roomIndex * 700) % 7200);
    return {
      id: `bot-${roomCode}-${i}`,
      name: `Bot ${i + 1}`,
      bot: true,
      x,
      y,
      angle: 0,
      hp: 100,
      color: `hsl(${(roomIndex * 55 + i * 48) % 360} 75% 58%)`,
      dir: rand(0, Math.PI * 2),
      nextTurn: performance.now() + rand(900, 2500),
      lastFire: performance.now() + rand(0, BOT_FIRE_COOLDOWN)
    };
  });
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
  const me = useRef({
    id: makeId(),
    name: playerName,
    x: rand(400, MAP_W - 400),
    y: rand(400, MAP_H - 400),
    angle: 0,
    hp: 100,
    kills: 0,
    lastFire: 0,
    color: `hsl(${Math.floor(rand(0, 360))} 80% 58%)`
  });
  const bots = useRef(makeBots(roomCode));
  const peers = useRef(new Map());
  const bullets = useRef([]);
  const channelRef = useRef(null);
  const [status, setStatus] = useState('Подключение...');
  const [playersCount, setPlayersCount] = useState(1);
  const [hp, setHp] = useState(100);
  const [mobile, setMobile] = useState(isMobileLike());
  const [portrait, setPortrait] = useState(innerHeight > innerWidth && isMobileLike());

  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      if (innerHeight > innerWidth) await screen.orientation?.lock?.('landscape');
      setPortrait(innerHeight > innerWidth && isMobileLike());
    } catch {
      setPortrait(innerHeight > innerWidth && isMobileLike());
    }
  };

  const leaveToMenu = async () => {
    try { await screen.orientation?.lock?.('portrait'); } catch {}
    try { if (document.fullscreenElement) await document.exitFullscreen?.(); } catch {}
    try { screen.orientation?.unlock?.(); } catch {}
    onLeave();
  };

  useEffect(() => {
    const updateScreen = () => {
      setMobile(isMobileLike());
      setPortrait(innerHeight > innerWidth && isMobileLike());
    };
    updateScreen();
    addEventListener('resize', updateScreen);
    addEventListener('orientationchange', updateScreen);
    document.addEventListener('fullscreenchange', updateScreen);
    return () => {
      removeEventListener('resize', updateScreen);
      removeEventListener('orientationchange', updateScreen);
      document.removeEventListener('fullscreenchange', updateScreen);
    };
  }, []);

  useEffect(() => {
    const channel = supabase.channel(`tanchiki:${roomCode}`, {
      config: { broadcast: { self: false }, presence: { key: me.current.id } }
    });
    channelRef.current = channel;
    channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (payload && payload.id !== me.current.id) peers.current.set(payload.id, { ...payload, seenAt: performance.now() });
    });
    channel.on('broadcast', { event: 'shot' }, ({ payload }) => {
      if (payload && payload.owner !== me.current.id) bullets.current.push({ ...payload, born: performance.now() });
    });
    channel.on('broadcast', { event: 'hit' }, ({ payload }) => {
      if (payload?.target !== me.current.id) return;
      damageMe(25);
    });
    channel.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await channel.track({ id: me.current.id, name: playerName, online_at: new Date().toISOString() });
        setStatus('Онлайн');
        setTimeout(() => {
          const realPlayers = Object.keys(channel.presenceState()).length;
          if (realPlayers > MAX_PLAYERS_PER_ROOM) {
            alert(`Комната заполнена: максимум ${MAX_PLAYERS_PER_ROOM} игроков.`);
            leaveToMenu();
          }
        }, 900);
      }
    });
    return () => channel.unsubscribe();
  }, [supabase, roomCode, playerName]);

  useEffect(() => {
    const down = (e) => keys.current.add(e.key.toLowerCase());
    const up = (e) => keys.current.delete(e.key.toLowerCase());
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const base = joyRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;
    const setStick = (x, y) => {
      const r = base.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const rx = x - cx;
      const ry = y - cy;
      const d = Math.hypot(rx, ry);
      const a = Math.atan2(ry, rx);
      const lim = Math.min(d, JOY_R);
      joy.current.dx = d > 4 ? Math.cos(a) * lim / JOY_R : 0;
      joy.current.dy = d > 4 ? Math.sin(a) * lim / JOY_R : 0;
      knob.style.transform = `translate3d(${joy.current.dx * JOY_R}px, ${joy.current.dy * JOY_R}px, 0)`;
    };
    const reset = () => {
      joy.current = { id: null, dx: 0, dy: 0 };
      knob.style.transform = 'translate3d(0,0,0)';
    };
    const blockJoystickEvent = (e) => { e.preventDefault(); e.stopPropagation(); };
    const down = (e) => { blockJoystickEvent(e); joy.current.id = e.pointerId; base.setPointerCapture?.(e.pointerId); setStick(e.clientX, e.clientY); };
    const move = (e) => { if (joy.current.id !== e.pointerId) return; blockJoystickEvent(e); setStick(e.clientX, e.clientY); };
    const up = (e) => { if (joy.current.id !== e.pointerId) return; blockJoystickEvent(e); reset(); };
    base.addEventListener('pointerdown', down);
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', up);
    return () => {
      base.removeEventListener('pointerdown', down);
      base.removeEventListener('pointermove', move);
      base.removeEventListener('pointerup', up);
      base.removeEventListener('pointercancel', up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    let last = performance.now();
    let sendTimer = 0;
    let raf = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2.5);
      const w = Math.max(1, Math.floor(r.width * dpr));
      const h = Math.max(1, Math.floor(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      camera.current.w = r.width;
      camera.current.h = r.height;
    };

    const toWorld = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      return { x: camera.current.x + clientX - r.left, y: camera.current.y + clientY - r.top };
    };
    const getTouchById = (touches, id) => {
      for (const t of touches) if (t.identifier === id) return t;
      return null;
    };
    const setAimFromPoint = (point) => {
      if (!point) return;
      pointer.current = { ...pointer.current, ...toWorld(point.clientX, point.clientY) };
    };
    const moveAim = (e) => {
      if (e.changedTouches) {
        const t = getTouchById(e.changedTouches, aimTouchId.current);
        if (!t) return;
        setAimFromPoint(t);
        return;
      }
      setAimFromPoint(e);
    };
    const aimDown = (e) => {
      if (e.target.closest?.('.joystick, .fireButton, .topbar')) return;
      if (e.changedTouches) {
        const t = e.changedTouches[0];
        aimTouchId.current = t.identifier;
        setAimFromPoint(t);
      } else setAimFromPoint(e);
      pointer.current.down = true;
      fire();
    };
    const aimUp = (e) => {
      if (e.changedTouches && aimTouchId.current !== null) {
        const t = getTouchById(e.changedTouches, aimTouchId.current);
        if (!t) return;
        aimTouchId.current = null;
      }
      pointer.current.down = false;
    };

    const fire = () => {
      const now = performance.now();
      if (now - me.current.lastFire < FIRE_COOLDOWN || me.current.hp <= 0) return;
      me.current.lastFire = now;
      const b = {
        id: makeId(), owner: me.current.id,
        x: me.current.x + Math.cos(me.current.angle) * 32,
        y: me.current.y + Math.sin(me.current.angle) * 32,
        vx: Math.cos(me.current.angle) * 620,
        vy: Math.sin(me.current.angle) * 620
      };
      bullets.current.push({ ...b, born: now });
      channelRef.current?.send({ type: 'broadcast', event: 'shot', payload: b });
    };

    const loop = (now) => {
      resize();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt, now, fire);
      updateCamera();
      draw(ctx, canvas);
      sendTimer += dt;
      if (sendTimer > 0.06) {
        sendTimer = 0;
        channelRef.current?.send({ type: 'broadcast', event: 'state', payload: { ...me.current } });
      }
      raf = requestAnimationFrame(loop);
    };

    canvas.addEventListener('mousemove', moveAim);
    canvas.addEventListener('mousedown', aimDown);
    canvas.addEventListener('touchstart', aimDown, { passive: true });
    canvas.addEventListener('touchmove', moveAim, { passive: true });
    addEventListener('mouseup', aimUp);
    addEventListener('touchend', aimUp);
    addEventListener('touchcancel', aimUp);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', moveAim);
      canvas.removeEventListener('mousedown', aimDown);
      canvas.removeEventListener('touchstart', aimDown);
      canvas.removeEventListener('touchmove', moveAim);
      removeEventListener('mouseup', aimUp);
      removeEventListener('touchend', aimUp);
      removeEventListener('touchcancel', aimUp);
    };
  }, []);

  const damageMe = (amount) => {
    me.current.hp = Math.max(0, me.current.hp - amount);
    setHp(me.current.hp);
    if (me.current.hp <= 0) {
      me.current.x = rand(400, MAP_W - 400);
      me.current.y = rand(400, MAP_H - 400);
      me.current.hp = 100;
      setTimeout(() => setHp(100), 350);
    }
  };

  const update = (dt, now, fire) => {
    updatePlayer(dt, fire);
    updateBots(dt, now);

    for (const [id, p] of peers.current) if (now - p.seenAt > PLAYER_TTL) peers.current.delete(id);
    const realPlayers = peers.current.size + 1;
    setPlayersCount(realPlayers);

    bullets.current = bullets.current
      .map((b) => ({ ...b, x: b.x + b.vx * dt, y: b.y + b.vy * dt }))
      .filter((b) => now - b.born < 2200 && b.x > -80 && b.x < MAP_W + 80 && b.y > -80 && b.y < MAP_H + 80 && !collidesWithBlock(b.x, b.y, BULLET_RADIUS));

    for (const b of bullets.current) {
      if (b.owner === me.current.id) {
        for (const p of peers.current.values()) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < 25) {
            channelRef.current?.send({ type: 'broadcast', event: 'hit', payload: { target: p.id, from: me.current.id } });
            b.born = 0;
          }
        }
        for (const bot of bots.current) {
          if (bot.hp > 0 && Math.hypot(b.x - bot.x, b.y - bot.y) < 25) {
            bot.hp -= 34;
            b.born = 0;
            if (bot.hp <= 0) respawnBot(bot);
          }
        }
      } else if (String(b.owner).startsWith('bot-')) {
        if (Math.hypot(b.x - me.current.x, b.y - me.current.y) < 25) {
          b.born = 0;
          damageMe(15);
        }
      }
    }
  };

  const updatePlayer = (dt, fire) => {
    let dx = joy.current.dx;
    let dy = joy.current.dy;
    const k = keys.current;
    if (k.has('w') || k.has('arrowup')) dy -= 1;
    if (k.has('s') || k.has('arrowdown')) dy += 1;
    if (k.has('a') || k.has('arrowleft')) dx -= 1;
    if (k.has('d') || k.has('arrowright')) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) moveTank(me.current, dx / len * SPEED * clamp(len, 0, 1) * dt, dy / len * SPEED * clamp(len, 0, 1) * dt);
    me.current.angle = Math.atan2(pointer.current.y - me.current.y, pointer.current.x - me.current.x);
    if (pointer.current.down) fire();
  };

  const updateBots = (dt, now) => {
    for (const bot of bots.current) {
      const distToMe = Math.hypot(me.current.x - bot.x, me.current.y - bot.y);
      if (now > bot.nextTurn) {
        bot.dir = distToMe < 1300 ? Math.atan2(me.current.y - bot.y, me.current.x - bot.x) + rand(-0.8, 0.8) : rand(0, Math.PI * 2);
        bot.nextTurn = now + rand(900, 2400);
      }
      moveTank(bot, Math.cos(bot.dir) * BOT_SPEED * dt, Math.sin(bot.dir) * BOT_SPEED * dt);
      bot.angle = distToMe < 1500 ? Math.atan2(me.current.y - bot.y, me.current.x - bot.x) : bot.dir;
      if (distToMe < 1400 && now - bot.lastFire > BOT_FIRE_COOLDOWN) {
        bot.lastFire = now;
        bullets.current.push({
          id: makeId(), owner: bot.id,
          x: bot.x + Math.cos(bot.angle) * 32,
          y: bot.y + Math.sin(bot.angle) * 32,
          vx: Math.cos(bot.angle) * 520,
          vy: Math.sin(bot.angle) * 520,
          born: now
        });
      }
    }
  };

  const moveTank = (tank, stepX, stepY) => {
    const nextX = clamp(tank.x + stepX, PLAYER_SIZE, MAP_W - PLAYER_SIZE);
    if (!collidesWithBlock(nextX, tank.y, TANK_RADIUS)) tank.x = nextX;
    else tank.dir = rand(0, Math.PI * 2);
    const nextY = clamp(tank.y + stepY, PLAYER_SIZE, MAP_H - PLAYER_SIZE);
    if (!collidesWithBlock(tank.x, nextY, TANK_RADIUS)) tank.y = nextY;
    else tank.dir = rand(0, Math.PI * 2);
  };

  const respawnBot = (bot) => {
    bot.x = rand(400, MAP_W - 400);
    bot.y = rand(400, MAP_H - 400);
    bot.hp = 100;
    bot.dir = rand(0, Math.PI * 2);
    bot.nextTurn = performance.now() + rand(900, 2500);
  };

  const updateCamera = () => {
    const c = camera.current;
    const tx = clamp(me.current.x - c.w / 2, 0, Math.max(0, MAP_W - c.w));
    const ty = clamp(me.current.y - c.h / 2, 0, Math.max(0, MAP_H - c.h));
    c.x += (tx - c.x) * 0.12;
    c.y += (ty - c.y) * 0.12;
  };

  const draw = (ctx, canvas) => {
    const r = canvas.getBoundingClientRect();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.save();
    ctx.translate(-Math.round(camera.current.x), -Math.round(camera.current.y));
    drawGround(ctx, camera.current);
    drawBlocks(ctx);
    for (const p of peers.current.values()) drawTank(ctx, p, false);
    for (const bot of bots.current) drawTank(ctx, bot, false);
    drawTank(ctx, me.current, true);
    for (const b of bullets.current) drawBullet(ctx, b);
    ctx.restore();
    drawMiniMap(ctx, r.width, r.height, me.current, peers.current, bots.current);
  };

  return (
    <div className="gameShell">
      {mobile && portrait && (
        <div className="portraitBlocker">
          <div>Переверните телефон</div>
          <small>Или нажмите кнопку ниже — игра откроется на весь экран и попробует повернуть экран.</small>
          <button onClick={enterFullscreen}>На весь экран и повернуть</button>
        </div>
      )}
      <header className="topbar">
        <div><b>Tanchiki</b> / room: <code>{roomCode}</code></div>
        <div className="stats"><span>{status}</span><span>Игроков: {playersCount}/{MAX_PLAYERS_PER_ROOM}</span><span>Боты: {BOT_COUNT}</span><span>HP: {hp}</span></div>
        <button className="small" onClick={leaveToMenu}>Выйти</button>
      </header>
      <canvas ref={canvasRef} className="gameCanvas" />
      <div className="joystick" ref={joyRef}><div className="joystickRing" /><div className="joystickKnob" ref={knobRef} /></div>
      <button className="fireButton" onPointerDown={(e) => { e.stopPropagation(); pointer.current.down = true; }} onPointerUp={(e) => { e.stopPropagation(); pointer.current.down = false; }} onPointerCancel={(e) => { e.stopPropagation(); pointer.current.down = false; }}>FIRE</button>
    </div>
  );
}

function circleRectHit(cx, cy, radius, rect) {
  const [x, y, w, h] = rect;
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  return Math.hypot(cx - nx, cy - ny) < radius;
}

function collidesWithBlock(x, y, radius) {
  return BLOCKS.some((block) => circleRectHit(x, y, radius, block));
}

function drawGround(ctx, cam) {
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

function drawBlocks(ctx) {
  ctx.fillStyle = '#253044';
  for (const [x, y, w, h] of BLOCKS) {
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.11)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
}

function drawTank(ctx, p, isMe) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
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
  ctx.fillText(p.name || 'tank', p.x, p.y - 28);
}

function drawBullet(ctx, b) {
  ctx.fillStyle = String(b.owner).startsWith('bot-') ? '#fb7185' : '#facc15';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawMiniMap(ctx, w, h, me, peers, bots) {
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
  for (const p of peers.values()) {
    ctx.fillStyle = p.color || '#60a5fa';
    ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  }
  for (const bot of bots) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(x + bot.x * sx, y + bot.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  }
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

createRoot(document.getElementById('root')).render(<App />);
