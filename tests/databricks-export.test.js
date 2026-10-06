#!/usr/bin/env node
/* The generated /databricks files must be runnable and faithful:
   - 00_create_dataset.sql recreates every table with exactly the playground's rows;
   - every solution file runs top to bottom without errors, and its result matches the playground.
   Usage: node tests/databricks-export.test.js */
'use strict';
const fs = require('fs'), path = require('path');
global.window = undefined;
['sql/parser', 'sql/functions', 'sql/engine', 'data', 'grader', 'challenges-1', 'challenges-2'].forEach(f => require(path.join(__dirname, '..', 'js', f + '.js')));
const X = global.SQLX;
const DIR = path.join(__dirname, '..', 'databricks');
let checks = 0, failures = 0;
const fail = m => { failures++; console.log('  FAIL ' + m); };
const key = rows => rows.map(r => JSON.stringify(r.map(X.grader.normValue))).sort().join('\n');

const fromScript = new X.Database();
fromScript.execute(fs.readFileSync(path.join(DIR, '00_create_dataset.sql'), 'utf8'));
const original = X.dataset.load(new X.Database());
for (const [name, t] of original.tables) {
  checks++;
  const s = fromScript.tables.get(name);
  if (!s) { fail(`dataset script did not create ${name}`); continue; }
  if (s.cols.map(c => c.name).join() !== t.cols.map(c => c.name).join()) fail(`${name}: columns differ`);
  else if (key(s.rows) !== key(t.rows)) fail(`${name}: rows differ (${s.rows.length} vs ${t.rows.length})`);
}
console.log(`  dataset script: ${original.tables.size} tables reproduced`);

let files = 0;
X.TRACKS.forEach((t, ti) => {
  X.CHALLENGES.filter(c => c.track === t.id).forEach((c, i) => {
    const f = path.join(DIR, 'solutions', `${String(ti + 1).padStart(2, '0')}-${t.id}`, `${String(i + 1).padStart(2, '0')}-${c.id}.sql`);
    checks++; files++;
    if (!fs.existsSync(f)) { fail(`missing ${f}`); return; }
    const db = fromScript.clone();
    try {
      const res = db.execute(fs.readFileSync(f, 'utf8'));
      const exp = X.grader.expected(c);
      const last = c.mode === 'state' ? res[res.length - 1] : [...res].reverse().find(r => r.kind === 'rows' && r.columns.length);
      if (key(last.rows) !== key(exp.rows)) fail(`${c.id}: running the solution file gives a different result than the playground`);
      if (!fs.existsSync(f.replace('/solutions/', '/challenges/'))) fail(`${c.id}: challenge file missing`);
    } catch (e) { fail(`${c.id}: solution file raised ${e.message}`); }
  });
});
console.log(`  ${files} solution files run cleanly against the dataset script`);
console.log(failures ? `${failures} of ${checks} checks failed` : `All ${checks} checks passed.`);
process.exit(failures ? 1 : 0);
