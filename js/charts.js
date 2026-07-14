// charts.js – selbstgezeichnetes SVG-Liniendiagramm (offline, keine Libs).

// Gut unterscheidbare Farbpalette (in Light & Dark brauchbar).
export const PALETTE = [
  '#2f6fed', '#e07b39', '#0f8a5f', '#c0399a',
  '#c9a227', '#5b6bd6', '#d1495b', '#4aa3a2',
  '#8a5cf6', '#7a8b3a', '#d46b9a', '#3aa0e0',
];

export function colorFor(index) {
  return PALETTE[index % PALETTE.length];
}

const escapeXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// series: { [playerId]: number[] }  (Länge = Anzahl Runden)
// players: [{id, name}] (Reihenfolge bestimmt Farbe)
export function renderChart(series, players) {
  const W = 640, H = 360;
  const m = { top: 16, right: 16, bottom: 28, left: 40 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const roundsCount = players.length ? (series[players[0].id] || []).length : 0;
  if (roundsCount === 0) return '';

  // Wertebereich inkl. Startpunkt 0.
  let min = 0, max = 0;
  for (const p of players) {
    for (const v of series[p.id] || []) { if (v < min) min = v; if (v > max) max = v; }
  }
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1 || 1;
  min -= pad; max += pad;

  const n = roundsCount; // x geht von 0 (Start) bis n (nach letzter Runde)
  const x = (i) => m.left + (n === 0 ? 0 : (i / n) * iw);
  const y = (v) => m.top + ih - ((v - min) / (max - min)) * ih;

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Punkteverlauf" preserveAspectRatio="xMidYMid meet" font-family="system-ui, sans-serif">`;

  // Y-Gitternetz + Beschriftung
  const ticks = niceTicks(min, max, 5);
  for (const t of ticks) {
    const yy = y(t);
    const isZero = Math.abs(t) < 1e-9;
    svg += `<line x1="${m.left}" y1="${yy.toFixed(1)}" x2="${W - m.right}" y2="${yy.toFixed(1)}" stroke="${isZero ? 'currentColor' : 'currentColor'}" stroke-opacity="${isZero ? 0.5 : 0.15}" stroke-width="1"/>`;
    svg += `<text x="${m.left - 6}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor" fill-opacity="0.6">${Math.round(t)}</text>`;
  }
  // X-Achsen-Beschriftung (Rundennummern, ausgedünnt)
  const step = Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i <= n; i += step) {
    svg += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity="0.6">${i}</text>`;
  }

  // Linien je Spieler
  players.forEach((p, idx) => {
    const data = series[p.id] || [];
    const pts = [[x(0), y(0)]];
    data.forEach((v, i) => pts.push([x(i + 1), y(v)]));
    const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ');
    const c = colorFor(idx);
    svg += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    // Endpunkt markieren
    const last = pts[pts.length - 1];
    svg += `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="${c}"/>`;
  });

  svg += '</svg>';
  return svg;
}

export function renderLegend(players) {
  return players
    .map((p, idx) => `<span class="lg"><span class="sw" style="background:${colorFor(idx)}"></span>${escapeXml(p.name)}</span>`)
    .join('');
}

function niceTicks(min, max, count) {
  const range = max - min;
  const rawStep = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step;
  if (norm < 1.5) step = 1; else if (norm < 3) step = 2; else if (norm < 7) step = 5; else step = 10;
  step *= mag;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let t = start; t <= max + 1e-9; t += step) ticks.push(t);
  return ticks;
}
