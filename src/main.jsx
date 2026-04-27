import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const MAP_W = 10000;
const MAP_H = 10000;
const PLAYER_SIZE = 34;
const SPEED = 260;
const FIRE_COOLDOWN = 420;
const PLAYER_TTL = 2500;
const JOY_R = 54;

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
  const [room, setRoom] = useState(localStorage.getItem('tank_room') || 'main');
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
            localStorage.setItem('tank_name', name.trim() || 'Player');
            localStorage.setItem('tank_room', room.trim() || 'main');
            setJoined(true);
          }}
        />
      ) : (
        <Game supabase={supabase} playerName={name.trim() || 'Player'} roomCode={room.trim() || 'main'} onLeave={() => setJoined(false)} />
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
        <div className="badge">REALTIME BROWSER BATTLE</div>
        <h1>Tanchiki Online</h1>
        <p>Карта 1×1 км, камера за танком, мини-карта, fullscreen и мобильный джойстик через Supabase Realtime.</p>
      </div>
      <div className="panel form">
        <label>Ник</label>
        <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} />
        <label>Комната</label>
        <input value={room} maxLength={24} onChange={(e) => setRoom(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} />
        <button onClick={onJoin}>Войти в бой</button>
        <p className="muted">На телефоне лучше играть горизонтально и на весь экран.</p>
      </div>
    </div>
  );
}

function Game({ supabase, playerName, roomCode, onLeave }) {
  const canvasRef = useRef(null);
  const joyRef = useRef(null);
  const knobRef = useRef(null);
  const keys = useRef(new Set());
  const pointer = useRef({ x: 5000, y: 5000, down: false });
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
  const peers = useRef(new Map());
  const bullets = useRef([]);
  const channelRef = useRef(null);
  const [status, setStatus] = useState('Подключение...');
  const [playersCount, setPlayersCount] = useState(1);
  const [hp, setHp] = useState(100);
  const [mobile, setMobile] = useState(isMobileLike());
  const [portrait, setPortrait] = useState(innerHeight > innerWidth && isMobileLike());
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  const enterFullscreen = async () => {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement) await el.requestFullscreen?.();
      await screen.orientation?.lock?.('landscape');
      setFullscreen(Boolean(document.fullscreenElement));
      setPortrait(innerHeight > innerWidth && isMobileLike());
    } catch {
      setPortrait(innerHeight > innerWidth && isMobileLike());
    }
  };

  useEffect(() => {
    const updateScreen = () => {
      setMobile(isMobileLike());
      setPortrait(innerHeight > innerWidth && isMobileLike());
      setFullscreen(Boolean(document.fullscreenElement));
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
      me.current.hp = Math.max(0, me.current.hp - 25);
      setHp(me.current.hp);
      if (me.current.hp <= 0) {
        me.current.x = rand(400, MAP_W - 400);
        me.current.y = rand(400, MAP_H - 400);
        me.current.hp = 100;
        setTimeout(() => setHp(100), 350);
      }
    });
    channel.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await channel.track({ name: playerName, online_at: new Date().toISOString() });
        setStatus('Онлайн');
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
    const down = (e) => {
      joy.current.id = e.pointerId;
      base.setPointerCapture?.(e.pointerId);
      setStick(e.clientX, e.clientY);
    };
    const move = (e) => {
      if (joy.current.id === e.pointerId) setStick(e.clientX, e.clientY);
    };
    const up = (e) => {
      if (joy.current.id === e.pointerId) reset();
    };
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
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      camera.current.w = r.width;
      camera.current.h = r.height;
    };

    const toWorld = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      return { x: camera.current.x + clientX - r.left, y: camera.current.y + clientY - r.top };
    };
    const moveAim = (e) => {
      const p = e.touches?.[0] || e;
      pointer.current = { ...pointer.current, ...toWorld(p.clientX, p.clientY) };
    };
    const aimDown = (e) => {
      moveAim(e);
      pointer.current.down = true;
      fire();
    };
    const aimUp = () => { pointer.current.down = false; };

    const fire = () => {
      const now = performance.now();
      if (now - me.current.lastFire < FIRE_COOLDOWN || me.current.hp <= 0) return;
      me.current.lastFire = now;
      const b = {
        id: makeId(),
        owner: me.current.id,
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
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', moveAim);
      canvas.removeEventListener('mousedown', aimDown);
      canvas.removeEventListener('touchstart', aimDown);
      canvas.removeEventListener('touchmove', moveAim);
      removeEventListener('mouseup', aimUp);
      removeEventListener('touchend', aimUp);
    };
  }, []);

  const update = (dt, now, fire) => {
    let dx = joy.current.dx;
    let dy = joy.current.dy;
    const k = keys.current;
    if (k.has('w') || k.has('arrowup')) dy -= 1;
    if (k.has('s') || k.has('arrowdown')) dy += 1;
    if (k.has('a') || k.has('arrowleft')) dx -= 1;
    if (k.has('d') || k.has('arrowright')) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
      const power = clamp(len, 0, 1);
      me.current.x = clamp(me.current.x + dx / len * SPEED * power * dt, PLAYER_SIZE, MAP_W - PLAYER_SIZE);
      me.current.y = clamp(me.current.y + dy / len * SPEED * power * dt, PLAYER_SIZE, MAP_H - PLAYER_SIZE);
    }
    me.current.angle = Math.atan2(pointer.current.y - me.current.y, pointer.current.x - me.current.x);
    if (pointer.current.down) fire();

    for (const [id, p] of peers.current) {
      if (now - p.seenAt > PLAYER_TTL) peers.current.delete(id);
    }
    setPlayersCount(peers.current.size + 1);

    bullets.current = bullets.current
      .map((b) => ({ ...b, x: b.x + b.vx * dt, y: b.y + b.vy * dt }))
      .filter((b) => now - b.born < 2200 && b.x > -80 && b.x < MAP_W + 80 && b.y > -80 && b.y < MAP_H + 80);

    for (const b of bullets.current) {
      if (b.owner !== me.current.id) continue;
      for (const p of peers.current.values()) {
        if (Math.hypot(b.x - p.x, b.y - p.y) < 25) {
          channelRef.current?.send({ type: 'broadcast', event: 'hit', payload: { target: p.id, from: me.current.id } });
          b.born = 0;
        }
      }
    }
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
    drawTank(ctx, me.current, true);
    for (const b of bullets.current) drawBullet(ctx, b);
    ctx.restore();
    drawMiniMap(ctx, r.width, r.height, me.current, peers.current);
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
        <div><b>Tanchiki</b> / room: <code>{roomCode}</code> / map: <code>1000×1000м</code></div>
        <div className="stats"><span>{status}</span><span>Игроков: {playersCount}</span><span>HP: {hp}</span></div>
        <button className="small fullscreenBtn" onClick={enterFullscreen}>{fullscreen ? 'Fullscreen ON' : 'Fullscreen'}</button>
        <button className="small" onClick={onLeave}>Выйти</button>
      </header>
      <canvas ref={canvasRef} className="gameCanvas" />
      <div className="joystick" ref={joyRef}><div className="joystickRing" /><div className="joystickKnob" ref={knobRef} /></div>
      <button className="fireButton" onPointerDown={() => { pointer.current.down = true; }} onPointerUp={() => { pointer.current.down = false; }} onPointerCancel={() => { pointer.current.down = false; }}>FIRE</button>
    </div>
  );
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
  ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,.35)';
  ctx.lineWidth = isMe ? 3 : 2;
  ctx.fillRect(-18, -15, 36, 30);
  ctx.strokeRect(-18, -15, 36, 30);
  ctx.fillStyle = '#d1d5db';
  ctx.fillRect(0, -5, 38, 10);
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '14px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(p.name || 'tank', p.x, p.y - 28);
}

function drawBullet(ctx, b) {
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawMiniMap(ctx, w, h, me, peers) {
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
    ctx.beginPath();
    ctx.arc(x + p.x * sx, y + p.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + me.x * sx, y + me.y * sy, 4.5, 0, Math.PI * 2);
  ctx.fill();
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
