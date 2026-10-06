#!/usr/bin/env node
/* Every challenge must be sound:
   - the reference solution runs and returns rows;
   - an independent alternative solution passes the grader (so a buggy reference can't define the truth);
   - every trap (a classic wrong answer) and the buggy starter query are rejected;
   - challenges that require an order are rejected when the order is wrong.
   Usage: node tests/challenges.test.js [challenge-id] */
'use strict';
const path = require('path');
global.window = undefined;
['sql/parser', 'sql/functions', 'sql/engine', 'data', 'grader', 'challenges-1', 'challenges-2'].forEach(f => { try { require(path.join(__dirname, '..', 'js', f + '.js')); } catch (e) { if (!/challenges-2/.test(f)) throw e; } });
const X = global.SQLX;
const only = process.argv[2];
let checks = 0, failures = 0;
const fail = (c, m) => { failures++; console.log(`  FAIL ${c.id}: ${m}`); };
const ids = new Set();
for (const c of X.CHALLENGES) {
  if (only && c.id !== only) continue;
  checks++;
  if (ids.has(c.id)) fail(c, 'duplicate id'); ids.add(c.id);
  if (!X.TRACKS.some(t => t.id === c.track)) fail(c, 'unknown track');
  let exp;
  try { exp = X.grader.expected(c); } catch (e) { fail(c, 'reference solution threw: ' + e.message); continue; }
  checks++;
  if (!exp || !exp.rows || !exp.rows.length) { fail(c, 'reference solution returned no rows'); continue; }
  if (c.alt) { checks++; const g = X.grader.grade(c, c.alt); if (!g.ok) fail(c, `alternative solution rejected: ${g.error || g.message} ${g.missing ? 'missing ' + JSON.stringify(g.missing[0]) : ''} ${g.extra ? 'extra ' + JSON.stringify(g.extra[0]) : ''}`); }
  else fail(c, 'no alternative solution');
  for (const t of c.traps || []) { checks++; const g = X.grader.grade(c, t); if (g.ok) fail(c, 'trap accepted: ' + t.slice(0, 90)); }
  if (c.starter) { checks++; const g = X.grader.grade(c, c.starter); if (g.ok) fail(c, 'buggy starter query passes'); }
  if (c.ordered && exp.rows.length > 2) {
    checks++;
    const rev = `SELECT * FROM (${c.solution.replace(/;\s*$/, '')}) ORDER BY 1 DESC`;
    if (c.mode !== 'state') { try { const g = X.grader.grade(c, rev); const same = X.grader.grade(c, c.solution); if (g.ok && same.ok && JSON.stringify(g.got.rows) !== JSON.stringify(exp.rows)) fail(c, 'accepts a wrongly ordered result'); } catch (e) { /* reordering not applicable */ } }
  }
  if (!only) process.stdout.write('.');
  else console.log(`  ${c.id}: ${exp.rows.length} rows, columns ${exp.columns.join(', ')}`);
}
console.log(`\n${X.CHALLENGES.length} challenges in ${X.TRACKS.length} tracks.`);
console.log(failures ? `${failures} of ${checks} checks failed` : `All ${checks} checks passed.`);
process.exit(failures ? 1 : 0);
