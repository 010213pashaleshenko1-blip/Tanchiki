import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MAP_W = 1200;
const MAP_H = 720;
const PLAYER_SIZE = 34;
const SPEED = 220;
const FIRE_COOLDOWN = 420;
const PLAYER_TTL = 2500;

const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const makeId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

function createSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 30 } },
  });
}

function App() {
  const supabase = useMemo(createSupabase, []);
  const [name, setName] = useState(localStorage.getItem('tank_name') || `Tank${Math.floor(rand(100, 999))}`);
  const [room, setRoom] = useState(localStorage.getItem('tank_room') || 'main');
  const [joined, setJoined] = useState(false);

  if (!supabase) {
    return <ConfigMissing />;
  }

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
        <p>2D-танки прямо в браузере: комнаты, Realtime, Canvas, стрельба и хаос без отдельного сервера.</p>
      </div>
      <div className="panel form">
        <label>Ник</label>
        <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} />
        <label>Комната</label>
        <input value={room} maxLength={24} onChange={(e) => setRoom(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} />
        <button onClick={onJoin}>Войти в бой</button>
        <p className="muted">Кинь другу тот же код комнаты — и вы будете на одной арене.</p>
      </div>
    </div>
  );
}

function Game({ supabase, playerName, roomCode, onLeave }) {
  const canvasRef = useRef(null);
  const keys = useRef(new Set());
  const pointer = useRef({ x: MAP_W / 2, y: MAP_H / 2, down: false });
  const me = useRef({
    id: makeId(),
    name: playerName,
    x: rand(80, MAP_W - 80),
    y: rand(80, MAP_H - 80),
    angle: 0,
    hp: 100,
    kills: 0,
    lastFire: 0,
    color: `hsl(${Math.floor(rand(0, 360))} 80% 58%)`,
  });
  const peers = useRef(new Map());
  const bullets = useRef([]);
  const channelRef = useRef(null);
  const [status, setStatus] = useState('Подключение...');
  const [playersCount, setPlayersCount] = useState(1);
  const [hp, setHp] = useState(100);

  useEffect(() => {
    const channel = supabase.channel(`tanchiki:${roomCode}`, {
      config: { broadcast: { self: false }, presence: { key: me.current.id } },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        if (!payload || payload.id === me.current.id) return;
        peers.current.set(payload.id, { ...payload, seenAt: performance.now() });
      })
      .on('broadcast', { event: 'shot' }, ({ payload }) => {
        if (!payload || payload.owner === me.current.id) return;
        bullets.current.push({ ...payload, born: performance.now() });
      })
      .on('broadcast', { event: 'hit' }, ({ payload }) => {
        if (payload?.target !== me.current.id) return;
        me.current.hp = Math.max(0, me.current.hp - 25);
        setHp(me.current.hp);
        if (me.current.hp <= 0) {
          me.current.x = rand(80, MAP_W - 80);
          me.current.y = rand(80, MAP_H - 80);
          me.current.hp = 100;
          setTimeout(() => setHp(100), 350);
        }
      })
      .subscribe(async (state) => {
        if (state === 'SUBSCRIBED') {
          await channel.track({ name: playerName, online_at: new Date().toISOString() });
          setStatus('Онлайн');
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [supabase, roomCode, playerName]);

  useEffect(() => {
    const down = (e) => keys.current.add(e.key.toLowerCase());
    const up = (e) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let last = performance.now();
    let sendTimer = 0;
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const box = canvas.getBoundingClientRect();
      canvas.width = Math.floor(box.width * dpr);
      canvas.height = Math.floor(box.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const canvasToWorld = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * MAP_W,
        y: ((clientY - rect.top) / rect.height) * MAP_H,
      };
    };
    const movePointer = (e) => {
      const p = e.touches?.[0] || e;
      pointer.current = { ...pointer.current, ...canvasToWorld(p.clientX, p.clientY) };
    };
    const pointerDown = (e) => {
      movePointer(e);
      pointer.current.down = true;
      fire();
    };
    const pointerUp = () => (pointer.current.down = false);
    canvas.addEventListener('mousemove', movePointer);
    canvas.addEventListener('mousedown', pointerDown);
    canvas.addEventListener('touchstart', pointerDown, { passive: true });
    window.addEventListener('mouseup', pointerUp);
    window.addEventListener('touchend', pointerUp);

    const fire = () => {
      const now = performance.now();
      if (now - me.current.lastFire < FIRE_COOLDOWN || me.current.hp <= 0) return;
      me.current.lastFire = now;
      const b = {
        id: makeId(),
        owner: me.current.id,
        x: me.current.x + Math.cos(me.current.angle) * 28,
        y: me.current.y + Math.sin(me.current.angle) * 28,
        vx: Math.cos(me.current.angle) * 520,
        vy: Math.sin(me.current.angle) * 520,
      };
      bullets.current.push({ ...b, born: now });
      channelRef.current?.send({ type: 'broadcast', event: 'shot', payload: b });
    };

    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt, now, fire);
      draw(ctx, canvas);
      sendTimer += dt;
      if (sendTimer > 0.06) {
        sendTimer = 0;
        channelRef.current?.send({ type: 'broadcast', event: 'state', payload: { ...me.current } });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', movePointer);
      canvas.removeEventListener('mousedown', pointerDown);
      canvas.removeEventListener('touchstart', pointerDown);
      window.removeEventListener('mouseup', pointerUp);
      window.removeEventListener('touchend', pointerUp);
    };
  }, []);

  const update = (dt, now, fire) => {
    const k = keys.current;
    let dx = 0;
    let dy = 0;
    if (k.has('w') || k.has('arrowup')) dy -= 1;
    if (k.has('s') || k.has('arrowdown')) dy += 1;
    if (k.has('a') || k.has('arrowleft')) dx -= 1;
    if (k.has('d') || k.has('arrowright')) dx += 1;
    const len = Math.hypot(dx, dy) || 1;
    me.current.x = clamp(me.current.x + (dx / len) * SPEED * dt, PLAYER_SIZE, MAP_W - PLAYER_SIZE);
    me.current.y = clamp(me.current.y + (dy / len) * SPEED * dt, PLAYER_SIZE, MAP_H - PLAYER_SIZE);
    me.current.angle = Math.atan2(pointer.current.y - me.current.y, pointer.current.x - me.current.x);
    if (pointer.current.down) fire();

    for (const [id, p] of peers.current) {
      if (now - p.seenAt > PLAYER_TTL) peers.current.delete(id);
    }
    setPlayersCount(peers.current.size + 1);

    bullets.current = bullets.current
      .map((b) => ({ ...b, x: b.x + b.vx * dt, y: b.y + b.vy * dt }))
      .filter((b) => now - b.born < 1600 && b.x > -40 && b.x < MAP_W + 40 && b.y > -40 && b.y < MAP_H + 40);

    for (const b of bullets.current) {
      if (b.owner === me.current.id) {
        for (const p of peers.current.values()) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < 25) {
            channelRef.current?.send({ type: 'broadcast', event: 'hit', payload: { target: p.id, from: me.current.id } });
            b.born = 0;
          }
        }
      }
    }
  };

  const draw = (ctx, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / MAP_W;
    const sy = rect.height / MAP_H;
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.scale(sx, sy);
    drawGrid(ctx);
    drawObstacles(ctx);
    for (const p of peers.current.values()) drawTank(ctx, p, false);
    drawTank(ctx, me.current, true);
    for (const b of bullets.current) drawBullet(ctx, b);
    ctx.restore();
  };

  return (
    <div className="gameShell">
      <header className="topbar">
        <div><b>Tanchiki</b> / room: <code>{roomCode}</code></div>
        <div className="stats"><span>{status}</span><span>Игроков: {playersCount}</span><span>HP: {hp}</span></div>
        <button className="small" onClick={onLeave}>Выйти</button>
      </header>
      <canvas ref={canvasRef} className="gameCanvas" />
      <div className="mobileControls">
        <button onTouchStart={() => keys.current.add('w')} onTouchEnd={() => keys.current.delete('w')}>▲</button>
        <button onTouchStart={() => keys.current.add('a')} onTouchEnd={() => keys.current.delete('a')}>◀</button>
        <button onTouchStart={() => keys.current.add('s')} onTouchEnd={() => keys.current.delete('s')}>▼</button>
        <button onTouchStart={() => keys.current.add('d')} onTouchEnd={() => keys.current.delete('d')}>▶</button>
      </div>
    </div>
  );
}

function drawGrid(ctx) {
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.strokeStyle = 'rgba(255,255,255,.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= MAP_W; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke();
  }
  for (let y = 0; y <= MAP_H; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke();
  }
}

function drawObstacles(ctx) {
  ctx.fillStyle = '#253044';
  const blocks = [[250, 140, 90, 180], [520, 320, 170, 70], [850, 100, 100, 240], [850, 520, 210, 70], [120, 520, 170, 80]];
  for (const [x, y, w, h] of blocks) {
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.11)';
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
  ctx.fillRect(0, -5, 34, 10);
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

createRoot(document.getElementById('root')).render(<App />);
