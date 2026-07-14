// scoring.js – Nullsummen-Punkteberechnung für Doppelkopf.
//
// Regel: Rundenwert `value`; in Bockrunden zählt er `bockFactor`-fach.
//   ev = value * (bock ? bockFactor : 1)
//   jeder Verlierer:  -ev
//   jeder Gewinner:   +(#Verlierer * ev) / #Gewinner
// Damit ergibt jede Runde in Summe 0. Ein Solo (1 Gewinner, 3 Verlierer)
// liefert automatisch +3·ev für den Solisten und -ev je Gegner.

export function effectiveValue(round, settings) {
  // Multiplikator: pro Runde gespeichert (2, 4, …); Fallback für alte Daten.
  const mult = round.bockMult && round.bockMult >= 1
    ? round.bockMult
    : (round.bock ? (settings && settings.bockFactor) || 2 : 1);
  return (Number(round.value) || 0) * mult;
}

export function winners(round) {
  return Object.keys(round.results).filter((pid) => round.results[pid] === 'won');
}
export function losers(round) {
  return Object.keys(round.results).filter((pid) => round.results[pid] === 'lost');
}

// Eine Runde ist gültig, wenn es mindestens einen Gewinner UND einen Verlierer gibt.
export function isRoundValid(round) {
  return winners(round).length >= 1 && losers(round).length >= 1;
}

// Solo ist nur erlaubt, wenn genau ein Spieler gewonnen hat.
export function soloAllowed(round) {
  return winners(round).length === 1;
}

// Punkte je beteiligtem Spieler für EINE Runde.
export function roundPoints(round, settings) {
  const ev = effectiveValue(round, settings);
  const w = winners(round);
  const l = losers(round);
  const out = {};
  if (w.length === 0 || l.length === 0) return out;
  const perWinner = (l.length * ev) / w.length;
  for (const pid of w) out[pid] = perWinner;
  for (const pid of l) out[pid] = -ev;
  return out;
}

// Gesamtpunkte je Spieler über alle Runden.
export function totals(state) {
  const acc = {};
  for (const p of state.players) acc[p.id] = 0;
  for (const round of state.rounds) {
    const pts = roundPoints(round, state.settings);
    for (const [pid, v] of Object.entries(pts)) {
      if (pid in acc) acc[pid] += v;
    }
  }
  return acc;
}

// Kumulative Punktestände je Spieler nach jeder Runde (für die Auswertung).
// Rückgabe: { [playerId]: number[] } mit Länge = Anzahl Runden.
export function cumulativeSeries(state) {
  const series = {};
  const running = {};
  for (const p of state.players) { series[p.id] = []; running[p.id] = 0; }
  for (const round of state.rounds) {
    const pts = roundPoints(round, state.settings);
    for (const p of state.players) {
      running[p.id] += pts[p.id] || 0;
      series[p.id].push(running[p.id]);
    }
  }
  return series;
}

// Zahl hübsch darstellen: ganze Zahlen ohne Nachkomma, sonst 1 Stelle.
export function fmt(n) {
  const r = Math.round(n * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return r > 0 ? '+' + s : s;
}

// Aggregierte Statistik je Spieler für die Auswertungstabelle.
export function playerStats(state) {
  const tot = totals(state);
  const stats = {};
  for (const p of state.players) {
    stats[p.id] = {
      total: tot[p.id] || 0, wins: 0, losses: 0, solosPlayed: 0, solosWon: 0,
      best: null, worst: null, played: 0,
    };
  }
  for (const round of state.rounds) {
    const w = winners(round);
    const l = losers(round);
    const pts = roundPoints(round, state.settings);
    for (const pid of w) if (stats[pid]) stats[pid].wins++;
    for (const pid of l) if (stats[pid]) stats[pid].losses++;
    for (const [pid, v] of Object.entries(pts)) {
      const s = stats[pid];
      if (!s) continue;
      s.played++;
      if (s.best === null || v > s.best) s.best = v;
      if (s.worst === null || v < s.worst) s.worst = v;
    }
    if (round.solo && w.length === 1) {
      const soloist = w[0];
      if (stats[soloist]) { stats[soloist].solosPlayed++; stats[soloist].solosWon++; }
    }
  }
  return stats;
}

// Gesamt-Kennzahlen über alle Runden/Spieler.
export function overallStats(state) {
  const nameOf = (pid) => (state.players.find((p) => p.id === pid) || {}).name || '?';
  let bestRound = null;   // { value, playerId, name, roundIndex }
  const soloByType = {};
  let bockRounds = 0;
  let soloTotal = 0;

  state.rounds.forEach((round, i) => {
    if (round.bock) bockRounds++;
    if (round.solo) {
      soloTotal++;
      soloByType[round.solo] = (soloByType[round.solo] || 0) + 1;
    }
    const pts = roundPoints(round, state.settings);
    for (const [pid, v] of Object.entries(pts)) {
      if (bestRound === null || v > bestRound.value) {
        bestRound = { value: v, playerId: pid, name: nameOf(pid), roundIndex: i + 1 };
      }
    }
  });

  // Führender Spieler (höchster Gesamtstand)
  const tot = totals(state);
  let leader = null;
  for (const p of state.players) {
    const v = tot[p.id] || 0;
    if (leader === null || v > leader.value) leader = { name: p.name, value: v };
  }

  return {
    rounds: state.rounds.length,
    bockRounds,
    soloTotal,
    soloByType,
    bestRound,
    leader,
  };
}
