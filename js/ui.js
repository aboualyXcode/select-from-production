/* ui.js: the browser front end. All SQL runs in js/sql/engine.js, grading in js/grader.js. */
(function () {
  'use strict';
  const X = window.SQLX;
  const $ = s => document.querySelector(s);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ---------- progress ---------- */
  const KEY = 'select-from-production:v1';
  const store = (() => {
    let d;
    try { d = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { d = {}; }
    d = Object.assign({ solved: {}, tried: {}, sql: {}, hints: {}, revealed: {}, intro: false }, d);
    return { d, save() { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private mode */ } } };
  })();

  const CH = X.CHALLENGES;
  const byId = id => CH.find(c => c.id === id);
  let current = null, mode = 'challenge', sandboxDb = null;
  const editor = $('#sql');

  /* ---------- syntax highlighting ---------- */
  const KW = new Set(('select from where group by having order limit offset join on using inner left right full outer cross semi anti union intersect except all distinct as and or not in is null like ilike rlike between case when then else end exists with recursive qualify window over partition rows range unbounded preceding following current row asc desc nulls first last true false interval lateral view insert into values update set delete merge matched create replace table temporary temp or drop if cast try_cast filter within').split(' '));
  function highlight(src) {
    const re = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.|'')*'?|"(?:[^"\\]|\\.)*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?|([\s\S])/g;
    let out = '', m;
    while ((m = re.exec(src)) !== null) {
      if (m[1]) out += `<span class="hl-c">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="hl-s">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="hl-n">${m[3]}</span>`;
      else if (m[4]) { const w = m[4]; out += KW.has(w.toLowerCase()) ? `<span class="hl-k">${w}</span>` : m[5] ? `<span class="hl-f">${w}</span>` : esc(w); if (m[5]) out += esc(m[5]); }
      else out += esc(m[6]);
    }
    return out + '\n';
  }
  function syncEditor() {
    const v = editor.value;
    $('#highlight').innerHTML = highlight(v);
    const n = v.split('\n').length;
    $('#gutter').textContent = Array.from({ length: Math.max(n, 8) }, (_, i) => i + 1).join('\n');
    editor.style.height = 'auto';
    editor.style.height = Math.max(220, editor.scrollHeight) + 'px';
    editor.style.width = 'auto';
    if (mode === 'challenge' && current) { store.d.sql[current.id] = v; store.save(); }
    if (mode === 'sandbox') { store.d.sql.__sandbox = v; store.save(); }
  }
  editor.addEventListener('input', syncEditor);
  editor.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (e.shiftKey && mode === 'challenge') submit(); else run(); return; }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const s = editor.selectionStart, en = editor.selectionEnd;
      editor.setRangeText('  ', s, en, 'end'); syncEditor();
    }
  });
  function insertAtCursor(text) {
    const s = editor.selectionStart, en = editor.selectionEnd;
    editor.setRangeText(text, s, en, 'end'); editor.focus(); syncEditor();
  }

  /* ---------- sidebar ---------- */
  function renderTracks() {
    const box = $('#tracks');
    box.replaceChildren(...X.TRACKS.map(t => {
      const list = CH.filter(c => c.track === t.id);
      const solved = list.filter(c => store.d.solved[c.id]).length;
      return h('section', { class: 'track' },
        h('h2', null, t.title, h('span', { text: `${solved}/${list.length}` })),
        h('ol', null, list.map(c => h('li', null, h('button', {
          type: 'button', class: 'ch-link' + (store.d.solved[c.id] ? ' is-solved' : store.d.tried[c.id] ? ' is-tried' : ''),
          'aria-current': mode === 'challenge' && current && current.id === c.id ? 'true' : 'false',
          title: c.scenario.replace(/<[^>]+>/g, ''),
          onclick: () => open(c.id),
        }, h('span', { class: 'st', 'aria-label': store.d.solved[c.id] ? 'solved' : 'not solved' }), h('span', { text: c.title }), h('span', { class: 'lv', text: '●'.repeat(c.level) + '○'.repeat(3 - c.level), 'aria-label': `level ${c.level} of 3` }))))));
    }));
    const n = Object.keys(store.d.solved).filter(id => byId(id)).length;
    $('#progress-text').textContent = `${n} of ${CH.length} solved`;
    $('#progress-bar').style.width = (100 * n / CH.length) + '%';
  }

  /* ---------- challenge ---------- */
  function open(id) {
    const c = byId(id) || CH[0];
    mode = 'challenge'; current = c;
    if (location.hash !== '#' + c.id) history.replaceState(null, '', '#' + c.id);
    document.title = `${c.title} · SELECT * FROM production`;
    const track = X.TRACKS.find(t => t.id === c.track);
    $('#ch-track').textContent = track.title;
    $('#ch-level').textContent = ['', 'Warm-up', 'Core', 'Hard'][c.level];
    $('#ch-mode').textContent = c.mode === 'state' ? (c.idempotent ? 'Changes data · must be idempotent' : 'Changes data') : c.ordered ? 'Order matters' : 'Any row order';
    $('#ch-title').textContent = c.title;
    $('#ch-scenario').innerHTML = c.scenario;
    $('#ch-task').innerHTML = c.task;
    $('#ch-tables').replaceChildren(...c.tables.map(t => h('button', { type: 'button', class: 'chip', text: t, onclick: () => focusTable(t) })));
    renderHelp();
    editor.value = store.d.sql[c.id] != null ? store.d.sql[c.id] : c.starter || `-- ${c.title}\n-- Tables: ${c.tables.join(', ')}\n\nSELECT \n`;
    syncEditor();
    $('#run-btn').textContent = 'Run'; $('#submit-btn').hidden = false; $('#reset-btn').textContent = 'Reset';
    clearFeedback();
    $('#results').replaceChildren(h('p', { class: 'empty', text: c.mode === 'state' ? 'Run your statements to see their output. Submit checks the resulting table.' : 'Run a query to see results.' }));
    $('#results-meta').textContent = '';
    renderTracks(); renderSchema();
    window.scrollTo({ top: 0 });
  }
  function renderHelp() {
    const c = current, shown = store.d.hints[c.id] || 0;
    const box = $('#ch-help');
    const kids = [];
    c.hints.slice(0, shown).forEach((t, i) => kids.push(h('p', { class: 'hint', html: `<b>Hint ${i + 1}.</b> ${esc(t)}` })));
    if (shown < c.hints.length) kids.push(h('button', { type: 'button', class: 'btn-secondary', text: shown ? `Another hint (${shown + 1} of ${c.hints.length})` : `Hint (${c.hints.length} available)`, onclick: () => { store.d.hints[c.id] = shown + 1; store.save(); renderHelp(); } }));
    kids.push(h('button', { type: 'button', class: 'btn-quiet', text: 'Show a solution', onclick: revealSolution }));
    box.replaceChildren(...kids);
  }
  function revealSolution() {
    const c = current;
    if (!store.d.tried[c.id] && !store.d.solved[c.id]) {
      showDialog(h('div', { class: 'dlg-in' }, h('h2', { text: 'Try it first?' }), h('p', { text: 'You learn far more from one failed attempt than from reading an answer. Submit something, even if you are unsure; the feedback shows which rows are missing or unexpected.' }),
        h('div', { class: 'actions' }, h('button', { class: 'btn-quiet', type: 'button', text: 'Show it anyway', onclick: () => { closeDialog(); store.d.tried[c.id] = (store.d.tried[c.id] || 0); store.d.revealed[c.id] = true; store.save(); showSolution(); } }),
          h('button', { class: 'btn-primary', type: 'button', text: 'Keep trying', onclick: closeDialog }))));
      return;
    }
    store.d.revealed[c.id] = true; store.save();
    showSolution();
  }
  function showSolution() {
    const c = current;
    setFeedback('ok', h('div', null, h('h3', { text: 'A reference solution' }), h('p', { html: 'Read it, then close this and write it yourself from memory. That is what makes it stick.' }), h('pre', { class: 'lesson-pre', html: highlight(c.solution) }),
      h('div', { class: 'next-row' }, h('button', { class: 'btn-secondary', type: 'button', text: 'Copy into the editor', onclick: () => { editor.value = c.solution; syncEditor(); } }))));
  }

  /* ---------- running and grading ---------- */
  function freshDb() {
    const db = X.grader.base();
    if (mode === 'challenge' && current && current.setup) db.execute(current.setup);
    return db;
  }
  function run() {
    const sql = editor.value;
    if (!sql.trim()) return;
    clearFeedback();
    const db = mode === 'sandbox' ? sandbox() : freshDb();
    const t0 = performance.now();
    try {
      const results = db.execute(sql);
      const shown = [...results].reverse().find(r => r.kind === 'rows' && r.columns.length) || results[results.length - 1];
      renderResult(shown, performance.now() - t0, results.length);
    } catch (e) { showError(e); $('#results').replaceChildren(h('p', { class: 'empty', text: 'No results.' })); $('#results-meta').textContent = ''; }
  }
  function submit() {
    if (mode !== 'challenge') return;
    const c = current, sql = editor.value;
    if (!sql.trim()) return;
    const t0 = performance.now();
    const g = X.grader.grade(c, sql);
    if (g.got) renderResult(g.got, performance.now() - t0, 1);
    if (g.error) { store.d.tried[c.id] = (store.d.tried[c.id] || 0) + 1; store.save(); renderTracks(); showError({ message: g.error, cls: g.cls }); return; }
    if (!g.ok) {
      store.d.tried[c.id] = (store.d.tried[c.id] || 0) + 1; store.save(); renderTracks();
      const fmt = r => r.map(v => (v == null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' | ');
      setFeedback('bad', h('div', null,
        h('h3', { text: 'Not quite' }),
        h('p', { text: g.message }),
        g.hint ? h('p', { text: g.hint }) : null,
        g.missing && g.missing.length ? h('div', { class: 'rows' }, h('div', { class: 'label', text: 'Expected, but missing from yours' }), g.missing.map(r => h('div', { class: 'miss', text: fmt(r) }))) : null,
        g.extra && g.extra.length ? h('div', { class: 'rows' }, h('div', { class: 'label', text: 'In yours, but not expected' }), g.extra.map(r => h('div', { class: 'extra', text: fmt(r) }))) : null));
      return;
    }
    const first = !store.d.solved[c.id];
    store.d.solved[c.id] = { at: Date.now(), revealed: !!store.d.revealed[c.id] }; store.save(); renderTracks();
    const idx = CH.indexOf(c), next = CH.slice(idx + 1).find(x => !store.d.solved[x.id]) || CH.find(x => !store.d.solved[x.id]);
    setFeedback('ok', h('div', null,
      h('h3', { text: first ? 'Correct' : 'Correct again' }),
      g.note ? h('p', { text: g.note }) : null,
      h('div', { class: 'lesson' }, h('div', { class: 'label', text: 'Why it matters' }), h('p', { html: c.explain }),
        c.alt ? h('details', { class: 'alt' }, h('summary', { text: 'Another way to write it' }), h('pre', { html: highlight(c.alt) })) : null,
        h('details', { class: 'alt' }, h('summary', { text: 'The reference solution' }), h('pre', { html: highlight(c.solution) }))),
      h('div', { class: 'next-row' }, next ? h('button', { class: 'btn-primary', type: 'button', text: `Next: ${next.title} →`, onclick: () => open(next.id) }) : h('p', { text: 'Every challenge solved. Impressive.' }))));
  }
  function renderResult(r, ms, statements) {
    const meta = $('#results-meta');
    if (!r) { $('#results').replaceChildren(h('p', { class: 'msg', text: 'Done.' })); meta.textContent = ''; return; }
    if (r.kind === 'message' || !r.columns.length) { $('#results').replaceChildren(h('p', { class: 'msg', text: r.message || 'Statement executed.' })); meta.textContent = `${statements} statement${statements === 1 ? '' : 's'} · ${Math.round(ms)} ms`; return; }
    const MAX = 500;
    const rows = r.rows.slice(0, MAX);
    const cls = v => (v == null ? 'null' : typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : 's');
    $('#results').replaceChildren(h('table', { class: 'grid' },
      h('thead', null, h('tr', null, h('th', { class: 'rn', text: '#' }), r.columns.map(c => h('th', { text: c })))),
      h('tbody', null, rows.map((row, i) => h('tr', null, h('td', { class: 'rn', text: String(i + 1) }), row.map(v => h('td', { class: cls(v), text: X.display(v), title: X.display(v).length > 40 ? X.display(v) : null })))))));
    meta.textContent = `${r.rows.length.toLocaleString()} row${r.rows.length === 1 ? '' : 's'}${r.rows.length > MAX ? ` (showing ${MAX})` : ''} · ${Math.round(ms)} ms`;
  }
  function showError(e) {
    const m = /^\[([A-Z_.]+)\]\s*([\s\S]*)$/.exec(e.message || String(e));
    setFeedback('err', h('div', null, h('h3', { text: 'Error' }), m ? h('span', { class: 'err-class', text: m[1] }) : null, h('div', { class: 'err-msg', text: m ? m[2] : e.message || String(e) })));
  }
  function setFeedback(kind, node) { const f = $('#feedback'); f.className = 'feedback ' + kind; f.replaceChildren(node); f.hidden = false; }
  function clearFeedback() { const f = $('#feedback'); f.hidden = true; f.replaceChildren(); }

  /* ---------- schema browser ---------- */
  function renderSchema() {
    const db = X.grader.base();
    const used = new Set(mode === 'challenge' && current ? current.tables : []);
    const tables = Array.from(db.tables.values()).filter(t => !t.temp);
    tables.sort((a, b) => (used.has(b.name) - used.has(a.name)) || (a.name < b.name ? -1 : 1));
    $('#schema').replaceChildren(...tables.map(t => h('details', { class: 'tbl' + (used.has(t.name) ? ' is-used' : ''), open: used.has(t.name) && used.size <= 3, 'data-table': t.name },
      h('summary', null, h('span', { text: t.name }), h('span', { class: 'rows', text: `${t.rows.length.toLocaleString()} rows` })),
      t.description ? h('p', { class: 'desc', text: t.description }) : null,
      h('ul', null, t.cols.map(c => h('li', null, h('button', { type: 'button', class: 'col', title: `Insert ${c.name}`, onclick: () => insertAtCursor(c.name) }, h('span', { text: c.name }), h('span', { class: 'ty', text: X.typeName(c.type).toLowerCase().replace('array<struct<…>>', 'array<struct>') }))))),
      h('div', { class: 'peek' }, h('button', { type: 'button', class: 'btn-quiet', text: `Preview ${t.name}`, onclick: () => preview(t.name) })))));
  }
  function preview(name) {
    const db = mode === 'sandbox' ? sandbox() : freshDb();
    const t0 = performance.now();
    try { renderResult(db.query(`SELECT * FROM ${name} LIMIT 50`), performance.now() - t0, 1); } catch (e) { showError(e); }
  }
  function focusTable(name) {
    const el = document.querySelector(`.tbl[data-table="${name}"]`);
    if (!el) return;
    el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    preview(name);
  }

  /* ---------- sandbox ---------- */
  function sandbox() { if (!sandboxDb) sandboxDb = X.grader.base(); return sandboxDb; }
  function openSandbox() {
    mode = 'sandbox'; current = null;
    history.replaceState(null, '', '#sandbox');
    document.title = 'Sandbox · SELECT * FROM production';
    $('#ch-track').textContent = 'Sandbox'; $('#ch-level').textContent = 'Free practice'; $('#ch-mode').textContent = 'Changes persist until you reset';
    $('#ch-title').textContent = 'Sandbox';
    $('#ch-scenario').innerHTML = 'The whole Stagedoor dataset, with no task and no grading. CREATE, INSERT, UPDATE, MERGE and DELETE all work, and changes persist until you press <b>Reset data</b> or reload the page.';
    $('#ch-task').innerHTML = 'Try something like <code>SHOW TABLES</code>, <code>DESCRIBE orders</code>, or a query of your own.';
    $('#ch-tables').replaceChildren(h('span', { class: 'muted', text: 'all of them' }));
    $('#ch-help').replaceChildren();
    editor.value = store.d.sql.__sandbox || 'SELECT status, COUNT(*) AS orders\nFROM orders\nGROUP BY ALL\nORDER BY orders DESC';
    syncEditor();
    $('#submit-btn').hidden = true; $('#reset-btn').textContent = 'Reset data';
    clearFeedback();
    $('#results').replaceChildren(h('p', { class: 'empty', text: 'Run a query to see results.' })); $('#results-meta').textContent = '';
    renderTracks(); renderSchema();
  }

  /* ---------- dialogs ---------- */
  function showDialog(node) { const d = $('#dlg'); $('#dlg-body').replaceChildren(node); if (!d.open) d.showModal(); }
  function closeDialog() { const d = $('#dlg'); if (d.open) d.close(); }
  function intro() {
    showDialog(h('div', { class: 'dlg-in' },
      h('p', { class: 'brand-big', html: '<span class="k">SELECT</span> * <span class="k">FROM</span> production' }),
      h('p', { text: `${CH.length} SQL challenges built from real production work at Stagedoor, a fictional concert-ticketing company. Each one is a request from a team, against a dataset as messy as the real thing: duplicate charges, orphaned refunds, malformed sign-ups, JSON events and gaps in the data.` }),
      h('ul', null,
        h('li', { html: 'Write <b>Databricks SQL</b>: <code>QUALIFY</code>, <code>GROUP BY ALL</code>, <code>LEFT ANTI JOIN</code>, <code>explode</code>, <code>MERGE</code> and friends all work.' }),
        h('li', { html: '<b>Run</b> with Ctrl+Enter to explore, <b>Submit</b> to be graded. Grading compares your result with the expected one, so any correct query passes.' }),
        h('li', { html: 'Everything runs in your browser on a Databricks-compatible engine, with ANSI mode on like a SQL warehouse.' })),
      h('p', { class: 'muted', text: 'Progress is saved in this browser only.' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn-primary', type: 'button', text: 'Start practising', onclick: () => { store.d.intro = true; store.save(); closeDialog(); editor.focus(); } }))));
  }

  /* ---------- wiring ---------- */
  $('#run-btn').addEventListener('click', run);
  $('#submit-btn').addEventListener('click', submit);
  $('#reset-btn').addEventListener('click', () => {
    if (mode === 'sandbox') { sandboxDb = null; renderSchema(); setFeedback('ok', h('div', null, h('h3', { text: 'Data reset' }), h('p', { text: 'The sandbox is back to the original Stagedoor dataset.' }))); return; }
    editor.value = current.starter || `-- ${current.title}\n-- Tables: ${current.tables.join(', ')}\n\nSELECT \n`;
    syncEditor(); clearFeedback();
  });
  $('#sandbox-btn').addEventListener('click', openSandbox);
  $('#dlg').addEventListener('click', e => { if (e.target === $('#dlg')) closeDialog(); });
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id === 'sandbox') openSandbox(); else if (byId(id)) open(id); });

  const start = location.hash.slice(1);
  if (start === 'sandbox') openSandbox(); else open(byId(start) ? start : (CH.find(c => !store.d.solved[c.id]) || CH[0]).id);
  if (!store.d.intro) intro();
  window.selectFromProduction = { open, run, submit, store };
})();
