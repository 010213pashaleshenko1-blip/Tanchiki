const A = String.fromCharCode(60, 100, 101, 109, 111, 110, 62);
const B = String.fromCharCode(60, 114, 105, 99, 104, 62);

export function parsePlayerName(raw) {
  let value = String(raw || 'Player').trim();
  const lower = value.toLowerCase();
  const special = lower.startsWith(A);
  const trail = lower.startsWith(B);

  if (special) value = value.slice(A.length).trim() || 'Player';
  if (trail) value = value.slice(B.length).trim() || 'Player';

  return { name: value, special, trail };
}
