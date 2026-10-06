/* grader.js: checks a learner's SQL against a challenge's reference solution.
   Query challenges compare result sets (as a multiset unless the challenge requires an order).
   State challenges run the learner's statements, then compare a check query on the resulting tables. */
(function (root) {
  'use strict';
  const X = root.SQLX;
  let pristine = null;
  const base = () => { if (!pristine) pristine = X.dataset.load(new X.Database()); return pristine.clone(); };
  const expectedCache = new Map();

  function normValue(v) {
    if (v == null) return null;
    if (typeof v === 'number') return Math.abs(v) < 1e15 ? Number(v.toFixed(4)) : v;
    if (v instanceof X.SqlDate || v instanceof X.SqlTs) return String(v);
    if (Array.isArray(v)) return v.map(normValue);
    if (v instanceof Map) { const o = {}; v.forEach((x, k) => { o[String(k)] = normValue(x); }); return o; }
    if (typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = normValue(v[k]); }); return o; }
    return v;
  }
  const rowKey = r => JSON.stringify(r.map(normValue));

  /* Run a script; return the last result that produced rows. */
  function runScript(db, sql) {
    const results = db.execute(sql);
    for (let i = results.length - 1; i >= 0; i--) if (results[i].kind === 'rows' && results[i].columns.length) return { last: results[i], all: results };
    return { last: results[results.length - 1], all: results };
  }
  function resultFor(ch, sql, times) {
    const db = base();
    if (ch.setup) db.execute(ch.setup);
    if (ch.mode === 'state') { for (let i = 0; i < (times || 1); i++) db.execute(sql); return db.query(ch.check); }
    return runScript(db, sql).last;
  }
  function expected(ch) {
    if (!expectedCache.has(ch.id)) expectedCache.set(ch.id, resultFor(ch, ch.solution));
    return expectedCache.get(ch.id);
  }

  function grade(ch, sql) {
    const exp = expected(ch);
    let got;
    try { got = resultFor(ch, sql); }
    catch (e) { return { ok: false, error: e.message, cls: e.cls, message: 'Your SQL raised an error.' }; }
    if (!got || got.kind !== 'rows' || !got.columns.length) return { ok: false, message: ch.mode === 'state' ? 'The check query found no rows.' : 'Your SQL ran but did not return a result set. End with a SELECT.', got };
    const out = { ok: false, got, expectedRows: exp.rows.length, expectedColumns: exp.columns };
    if (got.columns.length !== exp.columns.length) {
      out.message = `Your result has ${got.columns.length} column${got.columns.length === 1 ? '' : 's'}; the expected result has ${exp.columns.length}: ${exp.columns.join(', ')}.`;
      return out;
    }
    const gk = got.rows.map(rowKey), ek = exp.rows.map(rowKey);
    const count = keys => { const m = new Map(); keys.forEach(k => m.set(k, (m.get(k) || 0) + 1)); return m; };
    const gm = count(gk), em = count(ek);
    const missing = [], extra = [];
    em.forEach((n, k) => { const d = n - (gm.get(k) || 0); for (let i = 0; i < d; i++) missing.push(k); });
    gm.forEach((n, k) => { const d = n - (em.get(k) || 0); for (let i = 0; i < d; i++) extra.push(k); });
    if (missing.length || extra.length) {
      const parts = [`Your result has ${got.rows.length} row${got.rows.length === 1 ? '' : 's'}; the expected result has ${exp.rows.length}.`];
      if (got.rows.length === exp.rows.length) parts[0] = `Right number of rows (${got.rows.length}), but ${missing.length} of them differ from the expected result.`;
      out.message = parts.join(' ');
      out.missing = missing.slice(0, 3).map(k => JSON.parse(k));
      out.extra = extra.slice(0, 3).map(k => JSON.parse(k));
      const dupes = gk.length - new Set(gk).size;
      if (dupes && !(ek.length - new Set(ek).size)) out.hint = `${dupes} of your rows are exact duplicates. Look for a join that multiplies rows, or a missing DISTINCT or GROUP BY.`;
      return out;
    }
    if (ch.ordered && gk.join('\n') !== ek.join('\n')) {
      out.message = 'All the right rows, in the wrong order. Check your ORDER BY against the task (including tie-breakers).';
      return out;
    }
    if (ch.mode === 'state' && ch.idempotent) {
      let twice;
      try { twice = resultFor(ch, sql, 2); } catch (e) { out.message = `Correct after one run, but running it a second time fails: ${e.message} A retried job would crash.`; return out; }
      if (twice.rows.map(rowKey).join('\n') !== gk.join('\n') && twice.rows.map(rowKey).sort().join('\n') !== gk.slice().sort().join('\n')) {
        out.message = `Correct after one run, but running it twice changes the table (${twice.rows.length} rows instead of ${got.rows.length}). Jobs get retried: make the load idempotent.`;
        return out;
      }
    }
    out.ok = true;
    const names = got.columns.map(c => c.toLowerCase()), want = exp.columns.map(c => c.toLowerCase());
    if (names.join() !== want.join()) out.note = `Correct. Tip: the reference names its columns ${exp.columns.join(', ')}.`;
    return out;
  }

  X.grader = { grade, expected, base, normValue, runScript };
})(typeof window !== 'undefined' ? window : global);
