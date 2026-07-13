// storage.js – Persistenz (localStorage) + Export/Import als JSON-Datei.
import { ones } from './bock.js';

const STORAGE_KEY = 'doko-state';
export const STATE_VERSION = 2;

export const SOLO_TYPES = [
  { id: 'buben',      name: 'Bubensolo',       short: 'B', color: '#2f6fed' },
  { id: 'damen',      name: 'Damensolo',       short: 'D', color: '#c0399a' },
  { id: 'verdeckt',   name: 'Verdecktes Solo', short: 'V', color: '#555e6b' },
  { id: 'fleischlos', name: 'Fleischloser',    short: 'F', color: '#e07b39' },
  { id: 'trumpf',     name: 'Trumpfsolo',      short: 'T', color: '#0f8a5f' },
];

export function soloById(id) {
  return SOLO_TYPES.find((s) => s.id === id) || null;
}

export function defaultState() {
  return {
    version: STATE_VERSION,
    players: [],
    rounds: [],
    bockSchedule: [], // Zeitplan überlappender Bockrunden (siehe bock.js)
    imports: [],      // Historie: { at, source, players, rounds }
    settings: { bockFactor: 2 },
  };
}

// Namen normalisieren, um gleiche Spieler zu erkennen (Groß/Klein + Leerzeichen).
export function normName(name) {
  return String(name || '').trim().toLowerCase();
}

// Kleiner, stabiler ID-Generator (keine externe Abhängigkeit).
export function makeId() {
  return 'id-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (err) {
    console.warn('State konnte nicht geladen werden, starte neu.', err);
    return defaultState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('State konnte nicht gespeichert werden.', err);
  }
}

// Sorgt dafür, dass importierte/alte Daten alle erwarteten Felder haben.
export function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const players = Array.isArray(raw.players)
    ? raw.players
        .filter((p) => p && typeof p.name === 'string')
        .map((p) => ({ id: p.id || makeId(), name: String(p.name).slice(0, 24) }))
    : [];
  const playerIds = new Set(players.map((p) => p.id));
  const rounds = Array.isArray(raw.rounds)
    ? raw.rounds.map((r) => sanitizeRound(r, playerIds)).filter(Boolean)
    : [];
  const bockBase = Number(raw.settings && raw.settings.bockFactor) > 0
    ? Number(raw.settings.bockFactor)
    : 2;
  const imports = Array.isArray(raw.imports)
    ? raw.imports
        .filter((e) => e && typeof e === 'object')
        .map((e) => ({
          at: Number(e.at) || 0,
          source: String(e.source || 'Import'),
          players: Math.max(0, Math.round(Number(e.players) || 0)),
          rounds: Math.max(0, Math.round(Number(e.rounds) || 0)),
        }))
    : [];
  return {
    version: STATE_VERSION,
    players,
    rounds,
    bockSchedule: normalizeSchedule(raw),
    imports,
    settings: { bockFactor: bockBase },
  };
}

// Importierten State in einen bestehenden mergen.
// - Spieler mit gleichem Namen werden zusammengeführt (Runden angehängt).
// - Runden werden per id dedupliziert (kein doppeltes Einlesen derselben Datei).
// - Jeder Import wird mit Zeitstempel in state.imports protokolliert.
// Gibt einen NEUEN State zurück (mutiert die Eingaben nicht).
export function mergeImport(state, incoming, source, at) {
  const base = normalizeState(state);
  const add = normalizeState(incoming);
  const stamp = Number(at) || Date.now();

  const players = base.players.map((p) => ({ ...p }));
  const byName = new Map();
  players.forEach((p) => byName.set(normName(p.name), p.id));

  // id-Zuordnung: alte (importierte) Spieler-id -> id im Zielstate
  const idMap = {};
  add.players.forEach((p) => {
    const key = normName(p.name);
    if (byName.has(key)) {
      idMap[p.id] = byName.get(key);
    } else {
      const np = { id: makeId(), name: p.name };
      players.push(np);
      byName.set(key, np.id);
      idMap[p.id] = np.id;
    }
  });

  const existingRoundIds = new Set(base.rounds.map((r) => r.id));
  const rounds = base.rounds.map((r) => ({ ...r }));
  let added = 0;
  add.rounds.forEach((r, i) => {
    if (existingRoundIds.has(r.id)) return; // Duplikat überspringen
    const results = {};
    for (const [pid, val] of Object.entries(r.results)) {
      const mapped = idMap[pid];
      if (mapped) results[mapped] = val;
    }
    const createdAt = Number(r.createdAt) || stamp + i;
    rounds.push({ ...r, results, createdAt, importedAt: stamp, source });
    existingRoundIds.add(r.id);
    added += 1;
  });

  // Chronologisch sortieren, damit gemergte Sitzungen in Reihenfolge stehen.
  rounds.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const imports = base.imports.concat([
    { at: stamp, source: String(source || 'Import'), players: add.players.length, rounds: added },
  ]);

  return {
    version: STATE_VERSION,
    players,
    rounds,
    bockSchedule: base.bockSchedule,
    imports,
    settings: base.settings,
  };
}

// Bock-Zeitplan aus neuen (bockSchedule) oder alten (bockRemaining) Daten.
function normalizeSchedule(raw) {
  if (Array.isArray(raw.bockSchedule)) {
    return raw.bockSchedule
      .map((n) => Math.max(1, Math.round(Number(n) || 1)))
      .filter((n) => Number.isFinite(n));
  }
  const rem = Math.max(0, Math.round(Number(raw.bockRemaining) || 0));
  return ones(rem);
}

function sanitizeRound(r, playerIds) {
  if (!r || typeof r !== 'object') return null;
  const results = {};
  if (r.results && typeof r.results === 'object') {
    for (const [pid, val] of Object.entries(r.results)) {
      if (playerIds.has(pid) && (val === 'won' || val === 'lost')) results[pid] = val;
    }
  }
  const soloOk = SOLO_TYPES.some((s) => s.id === r.solo);
  // bockMult: neuer Multiplikator (2, 4, …). Alte Daten nur mit bock-Flag -> ×2.
  let bockMult = Math.round(Number(r.bockMult) || 0);
  if (!(bockMult >= 1)) bockMult = r.bock ? 2 : 1;
  const round = {
    id: r.id || makeId(),
    value: Math.max(1, Math.round(Number(r.value) || 1)),
    results,
    bock: bockMult > 1,
    bockMult,
    solo: soloOk ? r.solo : null,
    createdAt: Number(r.createdAt) || Date.now(),
  };
  // Herkunfts-Metadaten erhalten, falls vorhanden.
  if (Number(r.importedAt)) round.importedAt = Number(r.importedAt);
  if (r.source) round.source = String(r.source);
  return round;
}

// ---- Export / Import ----

export function exportState(state) {
  const payload = { ...state, exportedAt: Date.now() };
  const data = JSON.stringify(payload, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `doppelkopf-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Rohdaten + Metadaten (Dateiname, exportedAt) einer Datei einlesen.
export function readImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const source = String(file.name || 'Import').replace(/\.json$/i, '');
        const at = Number(parsed && parsed.exportedAt) || (file.lastModified || Date.now());
        resolve({ data: parsed, source, at });
      } catch (err) {
        reject(new Error(`„${file.name}" ist kein gültiges JSON.`));
      }
    };
    reader.onerror = () => reject(new Error(`„${file.name}" konnte nicht gelesen werden.`));
    reader.readAsText(file);
  });
}

export function importFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        resolve(normalizeState(parsed));
      } catch (err) {
        reject(new Error('Datei ist kein gültiges JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsText(file);
  });
}
