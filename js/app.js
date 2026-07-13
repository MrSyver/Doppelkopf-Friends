// app.js – UI-Steuerung, Rendering und Events.
import {
  loadState, saveState, defaultState, makeId, exportState,
  readImportFile, mergeImport,
  SOLO_TYPES, soloById, STATE_VERSION,
} from './storage.js';
import {
  roundPoints, totals, cumulativeSeries, isRoundValid, soloAllowed,
  fmt, playerStats,
} from './scoring.js';
import { renderChart, renderLegend, colorFor } from './charts.js';
import {
  isBockActive, remainingBock, appendBock, overlapBock,
  multForLayers, nextLayers, consumeBock,
} from './bock.js';

let state = loadState();

// Entwurf der aktuellen Runde (noch nicht gespeichert).
let draft = { results: {}, solo: null };

// ---------- Hilfen ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function persist() { saveState(state); }

let toastTimer;
function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---------- Tab-Navigation ----------
function showView(target) {
  $$('.view').forEach((v) => { v.hidden = v.dataset.view !== target; });
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.target === target));
  if (target === 'stats') renderStats();
  if (target === 'round') renderRoundTab();
  if (target === 'data') renderData();
}

// ---------- Spieler-Tab ----------
function renderPlayers() {
  const list = $('#player-list');
  list.innerHTML = '';
  $('#players-empty').hidden = state.players.length > 0;
  state.players.forEach((p, idx) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'p-dot';
    dot.style.background = colorFor(idx);
    const name = document.createElement('input');
    name.className = 'p-name';
    name.value = p.name;
    name.maxLength = 24;
    name.addEventListener('change', () => {
      const v = name.value.trim();
      if (v) { p.name = v; persist(); renderAll(); } else { name.value = p.name; }
    });
    const del = document.createElement('button');
    del.className = 'btn link';
    del.textContent = '🗑';
    del.title = 'Spieler löschen';
    del.addEventListener('click', () => removePlayer(p));
    li.append(dot, name, del);
    list.appendChild(li);
  });
}

function addPlayer(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  state.players.push({ id: makeId(), name: trimmed.slice(0, 24) });
  persist();
  renderAll();
}

function removePlayer(p) {
  const inRounds = state.rounds.some((r) => p.id in r.results);
  const msg = inRounds
    ? `„${p.name}" ist in gespeicherten Runden eingetragen. Wirklich löschen? Die bisherigen Punkte dieses Spielers bleiben in den Runden erhalten, er verschwindet aber aus den Übersichten.`
    : `„${p.name}" löschen?`;
  if (!confirm(msg)) return;
  state.players = state.players.filter((x) => x.id !== p.id);
  delete draft.results[p.id];
  persist();
  renderAll();
}

// ---------- Erfassungs-Tab ----------
function currentValue() {
  return Math.max(1, Math.round(Number($('#round-value').value) || 1));
}

function nextBockMult() {
  return multForLayers(nextLayers(state.bockSchedule), state.settings.bockFactor);
}

function draftRound() {
  return { value: currentValue(), results: draft.results, bockMult: nextBockMult(), solo: draft.solo };
}

function renderBockBanner() {
  const banner = $('#bock-banner');
  if (isBockActive(state.bockSchedule)) {
    const rem = remainingBock(state.bockSchedule);
    const mult = nextBockMult();
    const hasDoppel = state.bockSchedule.some((l) => l >= 2);
    banner.hidden = false;
    banner.innerHTML = `<span>🐏 Bock aktiv – noch ${rem} Runde${rem === 1 ? '' : 'n'}, nächste ×${mult}${hasDoppel ? ' · Doppelbock im Plan' : ''}</span>`;
    const stop = document.createElement('button');
    stop.textContent = 'Beenden';
    stop.addEventListener('click', () => { state.bockSchedule = []; persist(); renderRoundTab(); });
    banner.appendChild(stop);
  } else {
    banner.hidden = true;
    banner.innerHTML = '';
  }
}

function renderToggleGrid() {
  const grid = $('#player-toggle-grid');
  grid.innerHTML = '';
  $('#round-players-empty').hidden = state.players.length > 0;
  state.players.forEach((p) => {
    const st = draft.results[p.id] || 'neutral';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'p-toggle';
    btn.dataset.state = st;
    btn.dataset.pid = p.id;
    btn.innerHTML = `<span class="pname">${escapeHtml(p.name)}</span><span class="state">${stateLabel(st)}</span>`;
    btn.addEventListener('click', () => cyclePlayer(p.id, btn));
    grid.appendChild(btn);
  });
}

function stateLabel(st) {
  return st === 'won' ? 'Gewonnen' : st === 'lost' ? 'Verloren' : 'Neutral';
}

function cyclePlayer(pid, btn) {
  const cur = draft.results[pid] || 'neutral';
  const next = cur === 'neutral' ? 'won' : cur === 'won' ? 'lost' : 'neutral';
  if (next === 'neutral') delete draft.results[pid]; else draft.results[pid] = next;
  // Nur den angetippten Button aktualisieren (kein Neuaufbau des Grids).
  btn.dataset.state = next;
  const stateEl = btn.querySelector('.state');
  if (stateEl) stateEl.textContent = stateLabel(next);
  // Solo nur bei genau einem Gewinner erlaubt.
  if (!soloAllowed(draftRound())) draft.solo = null;
  renderSoloPicker();
  updateSaveButton();
}

function renderSoloPicker() {
  const picker = $('#solo-picker');
  const opts = $('#solo-options');
  const allowed = soloAllowed(draftRound());
  picker.hidden = !allowed;
  if (!allowed) return;
  opts.innerHTML = '';
  SOLO_TYPES.forEach((s) => {
    const el = document.createElement('div');
    el.className = 'solo-opt' + (draft.solo === s.id ? ' selected' : '');
    el.innerHTML = `<span class="solo-badge" style="background:${s.color}">${s.short}</span>${s.name}`;
    el.addEventListener('click', () => {
      draft.solo = draft.solo === s.id ? null : s.id;
      renderSoloPicker();
    });
    opts.appendChild(el);
  });
}

function updateSaveButton() {
  $('#save-round').disabled = !isRoundValid(draftRound());
}

function saveRound() {
  const dr = draftRound();
  if (!isRoundValid(dr)) { toast('Mindestens ein Gewinner und ein Verlierer nötig.'); return; }
  const mult = nextBockMult();
  const round = {
    id: makeId(),
    value: dr.value,
    results: { ...dr.results },
    bock: mult > 1,
    bockMult: mult,
    solo: soloAllowed(dr) ? dr.solo : null,
    createdAt: Date.now(),
  };
  state.rounds.push(round);
  // vorderste geplante Bockrunde verbrauchen
  state.bockSchedule = consumeBock(state.bockSchedule).rest;
  draft = { results: {}, solo: null };
  persist();
  renderRoundTab();
  toast('Runde gespeichert.');
}

// ---- Bock-Modal ----
function openBockModal() {
  const modal = $('#bock-modal');
  $('#bock-count').value = String(Math.max(1, state.players.length));
  // Überschneidungs-Auswahl nur zeigen, wenn bereits eine Bockrunde läuft.
  const overlap = isBockActive(state.bockSchedule);
  $('#bock-overlap').hidden = !overlap;
  const appendRadio = document.querySelector('input[name="bockmode"][value="append"]');
  if (appendRadio) appendRadio.checked = true;
  modal.hidden = false;
  $('#bock-count').focus();
  $('#bock-count').select();
}

function closeBockModal() { $('#bock-modal').hidden = true; }

function confirmBock() {
  const count = Math.max(0, Math.round(Number($('#bock-count').value) || 0));
  if (count <= 0) { closeBockModal(); return; }
  const overlap = isBockActive(state.bockSchedule);
  let msg;
  if (!overlap) {
    state.bockSchedule = appendBock([], count);
    msg = `Bockrunde: nächste ${count} Runde(n) ×${state.settings.bockFactor}.`;
  } else {
    const mode = (document.querySelector('input[name="bockmode"]:checked') || {}).value || 'append';
    if (mode === 'double') {
      state.bockSchedule = overlapBock(state.bockSchedule, count);
      msg = `Doppelbock: überschneidende Runden zählen ×${state.settings.bockFactor * 2}.`;
    } else {
      state.bockSchedule = appendBock(state.bockSchedule, count);
      msg = `Bockrunde angehängt (${count} Runde(n) ×${state.settings.bockFactor}).`;
    }
  }
  persist();
  closeBockModal();
  renderRoundTab();
  toast(msg);
}

function renderRoundsTable() {
  const table = $('#rounds-table');
  const empty = $('#rounds-empty');
  if (state.rounds.length === 0 || state.players.length === 0) {
    table.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const tot = totals(state);

  let head = '<thead><tr><th class="rlabel">#</th>';
  state.players.forEach((p) => { head += `<th>${escapeHtml(p.name)}</th>`; });
  head += '<th>Info</th><th></th></tr></thead>';

  let body = '<tbody>';
  state.rounds.forEach((round, i) => {
    const pts = roundPoints(round, state.settings);
    body += `<tr><td class="rlabel">${i + 1}</td>`;
    state.players.forEach((p) => {
      if (p.id in pts) {
        const v = pts[p.id];
        const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
        body += `<td class="${cls}">${fmt(v)}</td>`;
      } else {
        body += '<td>–</td>';
      }
    });
    body += `<td>${roundBadges(round)}</td>`;
    body += `<td><button class="del-round" title="Runde löschen" data-id="${round.id}">✕</button></td></tr>`;
  });
  body += '</tbody>';

  let foot = '<tfoot><tr class="total-row"><td class="rlabel">Σ</td>';
  state.players.forEach((p) => {
    const v = tot[p.id] || 0;
    const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
    foot += `<td class="${cls}">${fmt(v)}</td>`;
  });
  foot += '<td></td><td></td></tr></tfoot>';

  table.innerHTML = head + body + foot;
  $$('.del-round', table).forEach((b) => b.addEventListener('click', () => deleteRound(b.dataset.id)));
}

function roundBadges(round) {
  let out = '<span class="rbadges">';
  if (round.bock) {
    const m = round.bockMult || 2;
    out += `<span class="mini-badge bock" title="${m >= 4 ? 'Doppelbock' : 'Bockrunde'} ×${m}">🐏×${m}</span>`;
  }
  if (round.solo) {
    const s = soloById(round.solo);
    if (s) out += `<span class="mini-badge" style="background:${s.color}" title="${s.name}">${s.short}</span>`;
  }
  out += '</span>';
  return out;
}

function deleteRound(id) {
  const idx = state.rounds.findIndex((r) => r.id === id);
  if (idx < 0) return;
  if (!confirm(`Runde ${idx + 1} löschen?`)) return;
  state.rounds.splice(idx, 1);
  persist();
  renderRoundTab();
  renderStats();
}

function renderRoundTab() {
  renderBockBanner();
  renderToggleGrid();
  renderSoloPicker();
  updateSaveButton();
  renderRoundsTable();
}

// ---------- Auswertungs-Tab ----------
function renderStats() {
  const chartWrap = $('#chart-wrap');
  const legend = $('#chart-legend');
  const tableWrap = $('#stats-table-wrap');
  const empty = $('#stats-empty');

  if (state.rounds.length === 0 || state.players.length === 0) {
    chartWrap.innerHTML = ''; legend.innerHTML = ''; tableWrap.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const series = cumulativeSeries(state);
  chartWrap.innerHTML = renderChart(series, state.players);
  legend.innerHTML = renderLegend(state.players);

  const stats = playerStats(state);
  const bockCount = state.rounds.filter((r) => r.bock).length;
  const soloCount = state.rounds.filter((r) => r.solo).length;

  // Nach Punkten sortierte Rangliste.
  const ranked = [...state.players].sort((a, b) => (stats[b.id].total) - (stats[a.id].total));

  let html = '<table class="rounds-table"><thead><tr>'
    + '<th class="rlabel">Spieler</th><th>Punkte</th><th>Siege</th><th>Nied.</th><th>Solos</th>'
    + '</tr></thead><tbody>';
  ranked.forEach((p) => {
    const s = stats[p.id];
    const cls = s.total > 0 ? 'pos' : s.total < 0 ? 'neg' : '';
    const soloTxt = s.solosPlayed ? `${s.solosWon}/${s.solosPlayed}` : '–';
    html += `<tr><td class="rlabel">${escapeHtml(p.name)}</td>`
      + `<td class="${cls}">${fmt(s.total)}</td><td>${s.wins}</td><td>${s.losses}</td><td>${soloTxt}</td></tr>`;
  });
  html += '</tbody></table>';
  html += `<p class="hint" style="padding:10px 4px">Runden gesamt: ${state.rounds.length} · Bockrunden: ${bockCount} · Solos: ${soloCount}</p>`;
  tableWrap.innerHTML = html;
  tableWrap.style.border = 'none';
}

// ---------- Daten-Tab ----------
function renderData() {
  $('#version-note').textContent =
    `Version ${STATE_VERSION} · ${state.players.length} Spieler · ${state.rounds.length} Runden`;

  const wrap = $('#import-history');
  if (!wrap) return;
  const imports = state.imports || [];
  if (!imports.length) {
    wrap.innerHTML = '';
    return;
  }
  const fmtTime = (t) => {
    try { return new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return '—'; }
  };
  let html = '<h3>Import-Historie</h3><ul class="import-log">';
  // Neueste zuerst.
  [...imports].reverse().forEach((e) => {
    html += `<li><span class="il-time">${fmtTime(e.at)}</span>`
      + `<span class="il-src">${escapeHtml(e.source)}</span>`
      + `<span class="il-meta">${e.rounds} Runde(n), ${e.players} Spieler</span></li>`;
  });
  html += '</ul>';
  wrap.innerHTML = html;
}

function doImport(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  const plural = list.length === 1 ? 'Datei' : 'Dateien';
  if (!confirm(`${list.length} ${plural} importieren und an die aktuellen Daten anhängen? Spieler mit gleichem Namen werden zusammengeführt.`)) return;

  Promise.all(list.map((f) => readImportFile(f)))
    .then((entries) => {
      // In stabiler Reihenfolge (nach Zeitstempel der Datei) mergen.
      entries.sort((a, b) => (a.at || 0) - (b.at || 0));
      let merged = state;
      let addedRounds = 0;
      for (const e of entries) {
        const before = merged.rounds.length;
        merged = mergeImport(merged, e.data, e.source, e.at);
        addedRounds += merged.rounds.length - before;
      }
      state = merged;
      draft = { results: {}, solo: null };
      persist();
      renderAll();
      renderData();
      toast(`${list.length} ${plural} importiert · ${addedRounds} Runde(n) angehängt.`);
    })
    .catch((err) => { alert(err.message || 'Import fehlgeschlagen.'); });
}

function doReset() {
  if (!confirm('Wirklich ALLE Daten löschen? Exportiere vorher zur Sicherung, falls du sie behalten willst.')) return;
  state = defaultState();
  draft = { results: {}, solo: null };
  persist();
  renderAll();
  toast('Alles zurückgesetzt.');
}

// ---------- Gesamt-Render ----------
function renderAll() {
  renderPlayers();
  renderRoundTab();
  // Stats/Data werden beim Öffnen aktualisiert.
}

// ---------- Utilities ----------
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- Events verdrahten ----------
function bindEvents() {
  $('#tabbar').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) showView(tab.dataset.target);
  });

  $('#add-player-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#player-name-input');
    addPlayer(input.value);
    input.value = '';
    input.focus();
  });

  $('#value-minus').addEventListener('click', () => {
    const el = $('#round-value');
    el.value = Math.max(1, (Number(el.value) || 1) - 1);
  });
  $('#value-plus').addEventListener('click', () => {
    const el = $('#round-value');
    el.value = Math.max(1, (Number(el.value) || 1) + 1);
  });

  $('#start-bock').addEventListener('click', openBockModal);
  $('#save-round').addEventListener('click', saveRound);
  $('#bock-cancel').addEventListener('click', closeBockModal);
  $('#bock-confirm').addEventListener('click', confirmBock);
  $('#bock-modal').addEventListener('click', (e) => { if (e.target.id === 'bock-modal') closeBockModal(); });

  $('#export-btn').addEventListener('click', () => { exportState(state); toast('Export gestartet.'); });
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length) doImport(e.target.files);
    e.target.value = '';
  });
  $('#reset-btn').addEventListener('click', doReset);
}

// ---------- Service Worker ----------
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW-Registrierung fehlgeschlagen', err));
    });
  }
}

// ---------- Start ----------
bindEvents();
renderAll();
showView('players');
registerSW();
