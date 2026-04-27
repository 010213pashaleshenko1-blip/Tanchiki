const A = String.fromCharCode(60, 100, 101, 109, 111, 110, 62);
const B = String.fromCharCode(60, 114, 105, 99, 104, 62);
const C = String.fromCharCode(60, 108, 101, 118, 101, 108, 62);
const RICH_RE = /^<rich(?:=([0-9]*\.?[0-9]+))?>/i;
const LEVEL_RE = /^<level(?:=([0-9]+))?>/i;

export function parsePlayerName(raw) {
  let value = String(raw || 'Player').trim();
  let special = false;
  let trail = false;
  let unlimitedLevel = false;
  let trailIntervalMs = 2000;
  let trailMaxXp = 10;

  const readRich = () => {
    const richMatch = value.match(RICH_RE);
    if (!richMatch) return false;
    trail = true;
    const seconds = Number(richMatch[1] ?? 2);
    trailIntervalMs = Math.max(10, Number.isFinite(seconds) ? seconds * 1000 : 2000);
    value = value.slice(richMatch[0].length).trim() || 'Player';
    return true;
  };

  const readLevel = () => {
    const levelMatch = value.match(LEVEL_RE);
    if (!levelMatch) return false;
    unlimitedLevel = true;
    const maxXp = Number(levelMatch[1] ?? 10);
    trailMaxXp = Math.max(1, Number.isFinite(maxXp) ? Math.floor(maxXp) : 10);
    value = value.slice(levelMatch[0].length).trim() || 'Player';
    return true;
  };

  const lower = value.toLowerCase();

  if (lower.startsWith(A)) {
    special = true;
    value = value.slice(A.length).trim() || 'Player';
    return { name: value, special, trail, unlimitedLevel, trailIntervalMs, trailMaxXp };
  }

  if (readRich()) readLevel();
  else if (readLevel()) readRich();
  else if (lower.startsWith(B)) {
    trail = true;
    trailIntervalMs = 2000;
    value = value.slice(B.length).trim() || 'Player';
    readLevel();
  }

  return { name: value, special, trail, unlimitedLevel, trailIntervalMs, trailMaxXp };
}
