// bock.js – Verwaltung überlappender Bockrunden als "Zeitplan".
//
// state.bockSchedule ist ein Array. Jeder Eintrag steht für eine kommende
// Runde und enthält die Anzahl gestapelter Bock-Ebenen (Layer):
//   1 Layer  -> ×2   (normale Bockrunde)
//   2 Layer  -> ×4   (Doppelbock, zwei überlappende Bockrunden)
//   n Layer  -> base^n
// Beim Speichern einer Runde wird der vorderste Eintrag "verbraucht".

export function ones(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(1);
  return out;
}

// Läuft aktuell eine Bockrunde? -> nur dann ist ein Überschneiden möglich.
export function isBockActive(schedule) {
  return Array.isArray(schedule) && schedule.length > 0;
}

export function remainingBock(schedule) {
  return Array.isArray(schedule) ? schedule.length : 0;
}

// Anhängen: die neuen Runden laufen NACH den aktuellen (keine Überschneidung).
export function appendBock(schedule, count) {
  return (schedule || []).concat(ones(Math.max(0, count)));
}

// Doppelbock: die neuen Runden überlagern die aktuellen. Überschneidende
// Runden bekommen eine zusätzliche Ebene (×2 -> ×4), überstehende hängen ×2 an.
export function overlapBock(schedule, count) {
  const s = (schedule || []).slice();
  const n = Math.max(0, count);
  for (let i = 0; i < n; i++) {
    if (i < s.length) s[i] += 1;
    else s.push(1);
  }
  return s;
}

// Multiplikator für eine Runde aus der Anzahl Layer (base^layers).
export function multForLayers(layers, base = 2) {
  return layers > 0 ? Math.pow(base, layers) : 1;
}

// Layer der nächsten (kommenden) Runde, ohne zu verbrauchen.
export function nextLayers(schedule) {
  return isBockActive(schedule) ? schedule[0] : 0;
}

// Vordersten Eintrag verbrauchen; liefert verbrauchte Layer + Restplan.
export function consumeBock(schedule) {
  if (!isBockActive(schedule)) return { layers: 0, rest: [] };
  const s = schedule.slice();
  const layers = s.shift();
  return { layers, rest: s };
}
