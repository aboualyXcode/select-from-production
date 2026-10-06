/* engine.js: plans and executes the AST from parser.js against an in-memory catalog.
   Queries compile to closures once (so correlated subqueries are cheap), then run.
   Evaluation order follows Databricks: FROM → WHERE → GROUP BY → HAVING → window → QUALIFY → SELECT
   → DISTINCT → ORDER BY → LIMIT. */
(function (root) {
  'use strict';
  const X = root.SQLX;
  const { SqlError, SCALAR, AGG, HIGHER_ORDER, WINDOW_ONLY, GENERATORS, compare, keyOf, castValue, arith, likeRe, javaRe, Interval, typeOf } = X;

  /* ---------- helpers ---------- */
  const lc = s => String(s).toLowerCase();
  function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
  const suggest = (name, options) => options.map(o => [o, lev(lc(name), lc(o.replace(/`/g, '').split('.').pop()))]).sort((a, b) => a[1] - b[1]).slice(0, 5).map(x => x[0]);
  const truthy = v => v === true;
  const bt = s => '`' + s + '`';

  /* A readable name for an expression, the way Databricks labels unaliased columns. */
  function exprName(e) {
    switch (e.k) {
      case 'col': return e.parts[e.parts.length - 1];
      case 'lit': return e.v == null ? 'NULL' : typeof e.v === 'string' ? e.v : String(e.v);
      case 'fn': return e.star ? `${e.name}(1)` : `${e.name}(${e.distinct ? 'DISTINCT ' : ''}${e.args.map(exprName).join(', ')})`;
      case 'bin': return `(${exprName(e.l)} ${e.op} ${exprName(e.r)})`;
      case 'un': return e.op === 'NOT' ? `(NOT ${exprName(e.e)})` : `(${e.op} ${exprName(e.e)})`;
      case 'cast': return exprName(e.e);
      case 'field': return e.name;
      case 'case': return 'CASE WHEN … END';
      case 'index': return `${exprName(e.e)}[${exprName(e.idx)}]`;
      default: return e.k;
    }
  }

  /* ---------- scopes ---------- */
  class Scope {
    constructor(cols, parent, boundary) { this.cols = cols; this.parent = parent || null; this.boundary = boundary || null; }
    /* Returns {depth, index, rest} where rest are leftover parts (struct field access). */
    resolve(parts) {
      let s = this, depth = 0;
      while (s) {
        const r = s.resolveLocal(parts);
        if (r) { r.depth = depth; return r; }
        if (s.boundary) s.boundary.correlated = true;
        s = s.parent; depth++;
      }
      return null;
    }
    resolveLocal(parts) {
      if (this.resolver) return this.resolver(parts);
      const tryMatch = (tbl, name) => {
        const hits = [];
        this.cols.forEach((c, i) => { if (lc(c.name) === lc(name) && (tbl == null ? !c.hidden : lc(c.table || '') === lc(tbl))) hits.push(i); });
        return hits;
      };
      if (parts.length >= 2) {
        const h = tryMatch(parts[0], parts[1]);
        if (h.length === 1) return { index: h[0], rest: parts.slice(2) };
        if (h.length > 1) throw ambiguous(parts.slice(0, 2).join('.'), h.map(i => this.cols[i]));
      }
      const h = tryMatch(null, parts[0]);
      if (h.length === 1) return { index: h[0], rest: parts.slice(1) };
      if (h.length > 1) throw ambiguous(parts[0], h.map(i => this.cols[i]));
      return null;
    }
    names() { const out = []; for (let s = this; s; s = s.parent) s.cols.forEach(c => { if (!c.hidden && c.name) out.push(bt(c.table ? `${c.table}.${c.name}` : c.name)); }); return out; }
  }
  const ambiguous = (name, cols) => new SqlError('AMBIGUOUS_REFERENCE', `Reference ${bt(name)} is ambiguous, could be: [${cols.map(c => bt((c.table ? c.table + '.' : '') + c.name)).join(', ')}].`);
  const unresolved = (parts, scope) => {
    const sug = suggest(parts.join('.'), scope.names());
    return new SqlError('UNRESOLVED_COLUMN.WITH_SUGGESTION', `A column, variable, or function parameter with name ${bt(parts.join('.'))} cannot be resolved. Did you mean one of the following? [${sug.join(', ')}].`);
  };
  const fetch = (env, depth, index) => { let e = env; for (let i = 0; i < depth; i++) e = e.parent; return e.row[index]; };

  /* Structural fingerprint of an expression with columns resolved to positions, so `o.id` and `id` match. */
  function fingerprint(node, scope) {
    return JSON.stringify(node, function (k, v) {
      if (v && typeof v === 'object' && v.k === 'col') {
        try { const r = scope.resolve(v.parts); if (r) return `#c${r.depth}:${r.index}:${(r.rest || []).join('.')}`; } catch (e) { /* ambiguous: fall through */ }
        return '#n' + v.parts.map(lc).join('.');
      }
      if (v && typeof v === 'object' && v.k === 'fn') return Object.assign({}, v, { name: lc(v.name) });
      return v;
    });
  }
  const isAggCall = n => n.k === 'fn' && !n.over && (AGG[n.name] || (n.name === 'count'));
  function walk(node, fn) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, fn)); return; }
    if (fn(node) === false) return;
    for (const k of Object.keys(node)) {
      if (k === 'q' || k === 'over' && false) continue;
      const v = node[k];
      if (v && typeof v === 'object') walk(v, fn);
    }
  }
  function collectAggs(nodes) {
    const out = [];
    walk(nodes, n => {
      if (n.k === 'subq' || n.k === 'exists' || (n.k === 'in' && n.q)) { if (n.k === 'in') walk(n.e, x => { if (isAggCall(x)) { out.push(x); return false; } }); return false; }
      if (n.k === 'lambda') return false;
      if (isAggCall(n)) { out.push(n); return false; }
    });
    return out;
  }
  function collectWindows(nodes) {
    const out = [];
    walk(nodes, n => { if (n.k === 'subq' || n.k === 'exists') return false; if (n.k === 'fn' && n.over) { out.push(n); return false; } });
    return out;
  }
  const hasGenerator = e => e.k === 'fn' && GENERATORS.has(e.name);
  const UNIT_FNS = new Set(['datediff', 'date_diff', 'timestampdiff', 'dateadd', 'date_add', 'timestampadd']);
  /* Static shape of a generator argument, so output columns are known when the query is planned. */
  function staticShape(arg, scope) {
    if (arg.k === 'fn' && ['map', 'str_to_map', 'map_from_arrays', 'map_from_entries'].includes(arg.name)) return { map: true };
    if (arg.k === 'fn' && arg.name === 'array' && arg.args.length) {
      const el = arg.args[0];
      if (el.k === 'fn' && el.name === 'named_struct') return { fields: el.args.filter((_, i) => i % 2 === 0).map(x => String(x.v)) };
      if (el.k === 'fn' && el.name === 'struct') return { fields: el.args.map((a, i) => (a.k === 'col' ? a.parts[a.parts.length - 1] : `col${i + 1}`)) };
    }
    if (arg.k === 'fn' && arg.name === 'from_json' && arg.args[1] && arg.args[1].k === 'lit') {
      try { const t = X.parseType(arg.args[1].v); if (t.base === 'MAP') return { map: true }; if (t.base === 'ARRAY' && t.el.base === 'STRUCT') return { fields: t.el.fields.map(f => f.name) }; } catch (e) { /* reported at compile time */ }
    }
    if (arg.k === 'col') {
      try { const r = scope.resolve(arg.parts); if (r && !r.rest.length) { let s = scope; for (let d = 0; d < r.depth; d++) s = s.parent; const t = s.cols[r.index] && s.cols[r.index].type; if (t && t.base === 'MAP') return { map: true }; if (t && t.base === 'ARRAY' && t.el && t.el.base === 'STRUCT' && t.el.fields && t.el.fields.length) return { fields: t.el.fields.map(f => f.name) }; } } catch (e) { /* ignore */ }
    }
    return {};
  }
  function generatorCols(g, name, arg, scope) {
    const shape = staticShape(arg, scope);
    const base = name.replace('_outer', '');
    if (base === 'explode' && shape.map) return ['key', 'value'];
    if (base === 'posexplode' && shape.map) return ['pos', 'key', 'value'];
    if (base === 'inline') return shape.fields || ['col1'];
    return g.cols;
  }

  /* ================= the database ================= */
  class Database {
    constructor() { this.tables = new Map(); this.stats = { rowsScanned: 0 }; }
    table(nameParts, quiet) {
      const name = lc(Array.isArray(nameParts) ? nameParts[nameParts.length - 1] : nameParts);
      const t = this.tables.get(name);
      if (!t && !quiet) {
        const sug = suggest(name, Array.from(this.tables.values()).map(x => x.name));
        throw new SqlError('TABLE_OR_VIEW_NOT_FOUND', `The table or view ${bt(Array.isArray(nameParts) ? nameParts.join('.') : nameParts)} cannot be found. Verify the spelling and correctness of the schema and catalog.${sug.length ? ` Did you mean one of: ${sug.slice(0, 3).map(bt).join(', ')}?` : ''}`);
      }
      return t;
    }
    createTable(name, cols, rows) {
      this.tables.set(lc(name), { name, cols: cols.map(c => (typeof c === 'string' ? { name: c, type: { base: 'STRING' } } : c)), rows: rows || [] });
    }
    clone() { const d = new Database(); this.tables.forEach((t, k) => d.tables.set(k, { name: t.name, cols: t.cols, rows: t.rows.map(r => r.slice()), view: t.view, temp: t.temp })); return d; }

    /* Run a script. Returns one result per statement: {columns, rows, kind, message}. */
    execute(sql, opts) {
      const statements = X.parse(sql);
      const results = [];
      for (const st of statements) {
        const t0 = Date.now();
        const r = this.run(st, opts || {});
        r.ms = Date.now() - t0;
        r.statement = st.text;
        results.push(r);
      }
      return results;
    }
    query(sql) { const r = this.execute(sql); return r[r.length - 1]; }
    run(st) {
      switch (st.k) {
        case 'query': { const plan = planQuery(st.q, { db: this, ctes: new Map() }, null); const rows = plan.run(null); return { kind: 'rows', columns: plan.cols.filter(c => !c.hidden).map(c => c.name), rows: rows.map(r => r.filter((_, i) => !plan.cols[i].hidden)) }; }
        case 'explain': return { kind: 'message', columns: ['plan'], rows: [['Plans are shown by EXPLAIN on Databricks. This engine evaluates FROM → WHERE → GROUP BY → HAVING → windows → QUALIFY → SELECT → DISTINCT → ORDER BY → LIMIT.']] };
        case 'insert': return this.insert(st);
        case 'update': return this.update(st);
        case 'delete': return this.del(st);
        case 'merge': return this.merge(st);
        case 'createTable': return this.ddlCreate(st);
        case 'createView': {
          const name = st.name[st.name.length - 1];
          if (this.tables.has(lc(name)) && !st.orReplace) { if (st.ifNotExists) return msg('View already exists; nothing changed.'); throw new SqlError('TABLE_OR_VIEW_ALREADY_EXISTS', `Cannot create table or view ${bt(name)} because it already exists. Choose a different name, drop the existing object, or add CREATE OR REPLACE.`); }
          const plan = planQuery(st.q, { db: this, ctes: new Map() }, null);
          this.tables.set(lc(name), { name, cols: plan.cols.filter(c => !c.hidden).map(c => ({ name: c.name, type: { base: 'STRING' } })), rows: [], view: st.q, temp: st.temp });
          return msg(`${st.temp ? 'Temporary view' : 'View'} ${name} created.`);
        }
        case 'drop': {
          const name = st.name[st.name.length - 1];
          const t = this.tables.get(lc(name));
          if (!t) { if (st.ifExists) return msg('Nothing to drop.'); this.table(st.name); }
          if (st.kind === 'view' && !t.view) throw new SqlError('WRONG_COMMAND_FOR_OBJECT_TYPE', `${bt(name)} is a table. Use DROP TABLE instead.`);
          if (st.kind === 'table' && t.view) throw new SqlError('WRONG_COMMAND_FOR_OBJECT_TYPE', `${bt(name)} is a view. Use DROP VIEW instead.`);
          this.tables.delete(lc(name));
          return msg(`${st.kind === 'view' ? 'View' : 'Table'} ${name} dropped.`);
        }
        case 'truncate': { const t = this.table(st.name); t.rows = []; return msg(`Table ${t.name} truncated.`); }
        case 'show': return { kind: 'rows', columns: ['tableName', 'isTemporary'], rows: Array.from(this.tables.values()).map(t => [t.name, !!t.temp]).sort() };
        case 'describe': { const t = this.table(st.name); if (t.view) { const p = planQuery(t.view, { db: this, ctes: new Map() }, null); return { kind: 'rows', columns: ['col_name', 'data_type'], rows: p.cols.filter(c => !c.hidden).map(c => [c.name, 'view column']) }; } return { kind: 'rows', columns: ['col_name', 'data_type', 'nullable'], rows: t.cols.map(c => [c.name, X.typeName(c.type).toLowerCase(), !c.notNull]) }; }
        case 'noop': return msg(st.note);
        default: throw new SqlError('UNSUPPORTED_FEATURE', 'This statement is not supported in the lab.');
      }
    }
    coerceRow(t, values, cols) {
      const out = t.cols.map(c => (c.def ? null : null));
      const targets = cols ? cols.map(n => { const i = t.cols.findIndex(c => lc(c.name) === lc(n)); if (i < 0) throw new SqlError('UNRESOLVED_COLUMN.WITH_SUGGESTION', `A column with name ${bt(n)} cannot be resolved in table ${bt(t.name)}. Did you mean one of the following? [${suggest(n, t.cols.map(c => c.name)).map(bt).join(', ')}].`); return i; }) : t.cols.map((_, i) => i);
      if (values.length !== targets.length) throw new SqlError('INSERT_COLUMN_ARITY_MISMATCH.' + (values.length > targets.length ? 'TOO_MANY_DATA_COLUMNS' : 'NOT_ENOUGH_DATA_COLUMNS'), `Cannot write to ${bt(t.name)}, the reason is ${values.length > targets.length ? 'too many' : 'not enough'} data columns: table columns: ${targets.map(i => bt(t.cols[i].name)).join(', ')}; data columns: ${values.length} values.`);
      targets.forEach((ti, k) => { out[ti] = castValue(values[k], t.cols[ti].type, false); });
      t.cols.forEach((c, i) => { if (out[i] == null && c.notNull) throw new SqlError('DELTA_NOT_NULL_CONSTRAINT_VIOLATED', `NOT NULL constraint violated for column: ${c.name}.`); });
      return out;
    }
    insert(st) {
      const t = this.table(st.name);
      if (t.view) throw new SqlError('EXPECT_TABLE_NOT_VIEW', `${bt(t.name)} is a view. INSERT expects a table.`);
      const plan = planQuery(st.q, { db: this, ctes: new Map() }, null);
      const rows = plan.run(null).map(r => r.filter((_, i) => !plan.cols[i].hidden));
      const coerced = rows.map(r => this.coerceRow(t, r, st.cols));
      if (st.overwrite) t.rows = coerced; else t.rows.push(...coerced);
      return { kind: 'rows', columns: ['num_affected_rows', 'num_inserted_rows'], rows: [[coerced.length, coerced.length]] };
    }
    tableScope(t, alias) { return new Scope(t.cols.map(c => ({ name: c.name, table: alias || t.name })), null); }
    update(st) {
      const t = this.table(st.name);
      const scope = this.tableScope(t, st.alias);
      const ctx = { db: this, ctes: new Map() };
      const where = st.where ? compile(st.where, scope, ctx) : null;
      const sets = st.set.map(s => { const i = t.cols.findIndex(c => lc(c.name) === lc(s.col)); if (i < 0) throw unresolved([s.col], scope); return { i, f: compile(s.e, scope, ctx) }; });
      let n = 0;
      t.rows = t.rows.map(r => {
        const env = { row: r };
        if (where && !truthy(where(env))) return r;
        n++;
        const nr = r.slice();
        sets.forEach(s => { nr[s.i] = castValue(s.f(env), t.cols[s.i].type, false); if (nr[s.i] == null && t.cols[s.i].notNull) throw new SqlError('DELTA_NOT_NULL_CONSTRAINT_VIOLATED', `NOT NULL constraint violated for column: ${t.cols[s.i].name}.`); });
        return nr;
      });
      return { kind: 'rows', columns: ['num_affected_rows'], rows: [[n]] };
    }
    del(st) {
      const t = this.table(st.name);
      const scope = this.tableScope(t, st.alias);
      const where = st.where ? compile(st.where, scope, { db: this, ctes: new Map() }) : null;
      const before = t.rows.length;
      t.rows = t.rows.filter(r => !(where ? truthy(where({ row: r })) : true));
      return { kind: 'rows', columns: ['num_affected_rows'], rows: [[before - t.rows.length]] };
    }
    merge(st) {
      const t = this.table(st.target.name);
      const ctx = { db: this, ctes: new Map() };
      const src = planFrom(st.source, ctx, null);
      const srcRows = src.run(null);
      const tAlias = st.target.alias || t.name;
      const tCols = t.cols.map(c => ({ name: c.name, table: tAlias }));
      const both = new Scope(tCols.concat(src.cols), null);
      const srcOnly = new Scope(src.cols, null);
      const on = compile(st.on, both, ctx);
      const nT = t.cols.length;
      const nullT = t.cols.map(() => null), nullS = src.cols.map(() => null);
      const clause = c => {
        const sc = c.kind === 'notMatched' ? srcOnly : both;
        const out = { kind: c.kind, action: c.action, cond: c.cond ? compile(c.cond, sc, ctx) : null };
        const srcIndex = name => { const i = src.cols.findIndex(x => lc(x.name) === lc(name) && !x.hidden); if (i < 0) throw new SqlError('UNRESOLVED_COLUMN.WITH_SUGGESTION', `Cannot resolve ${bt(name)} in the MERGE source for \`${c.action === 'insert' ? 'INSERT *' : 'UPDATE SET *'}\`. The source must have every target column. Did you mean one of the following? [${suggest(name, src.cols.map(x => x.name)).map(bt).join(', ')}].`); return i; };
        if (c.action === 'update') out.sets = c.star ? t.cols.map((col, i) => { const si = srcIndex(col.name); return { i, f: env => env.row[nT + si] }; }) : c.set.map(s => { const i = t.cols.findIndex(col => lc(col.name) === lc(s.col)); if (i < 0) throw unresolved([s.col], both); return { i, f: compile(s.e, both, ctx) }; });
        if (c.action === 'insert') {
          if (c.star) out.values = t.cols.map(col => { const si = srcIndex(col.name); return env => env.row[si]; });
          else { if (c.cols.length !== c.values.length) throw new SqlError('INSERT_COLUMN_ARITY_MISMATCH', 'The number of INSERT columns and VALUES must match.'); out.cols = c.cols; out.valueFns = c.values.map(v => compile(v, srcOnly, ctx)); }
        }
        return out;
      };
      const clauses = st.clauses.map(clause);
      const matched = clauses.filter(c => c.kind === 'matched'), notMatched = clauses.filter(c => c.kind === 'notMatched'), bySource = clauses.filter(c => c.kind === 'notMatchedBySource');
      const srcHit = new Array(srcRows.length).fill(false);
      let upd = 0, del = 0, ins = 0;
      const newRows = [];
      for (const tr of t.rows) {
        const hits = [];
        srcRows.forEach((sr, j) => { if (truthy(on({ row: tr.concat(sr) }))) hits.push(j); });
        hits.forEach(j => { srcHit[j] = true; });
        if (hits.length > 1 && matched.length) throw new SqlError('DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE', `Cannot perform Merge as multiple source rows matched and attempted to modify the same target row in the Delta table in possibly conflicting ways. ${hits.length} source rows matched one target row. Deduplicate the source first, for example with QUALIFY ROW_NUMBER() OVER (PARTITION BY <key> ORDER BY <newest first>) = 1.`);
        if (hits.length) {
          const env = { row: tr.concat(srcRows[hits[0]]) };
          const c = matched.find(m => !m.cond || truthy(m.cond(env)));
          if (!c) { newRows.push(tr); continue; }
          if (c.action === 'delete') { del++; continue; }
          const nr = tr.slice(); c.sets.forEach(s => { nr[s.i] = castValue(s.f(env), t.cols[s.i].type, false); }); upd++; newRows.push(nr); continue;
        }
        const env = { row: tr.concat(nullS) };
        const c = bySource.find(m => !m.cond || truthy(m.cond(env)));
        if (!c) { newRows.push(tr); continue; }
        if (c.action === 'delete') { del++; continue; }
        const nr = tr.slice(); c.sets.forEach(s => { nr[s.i] = castValue(s.f(env), t.cols[s.i].type, false); }); upd++; newRows.push(nr);
      }
      srcRows.forEach((sr, j) => {
        if (srcHit[j]) return;
        const env = { row: sr };
        const c = notMatched.find(m => !m.cond || truthy(m.cond(env)));
        if (!c) return;
        if (c.values) newRows.push(this.coerceRow(t, c.values.map(f => f(env))));
        else newRows.push(this.coerceRow(t, c.valueFns.map(f => f(env)), c.cols));
        ins++;
      });
      void nullT;
      t.rows = newRows;
      return { kind: 'rows', columns: ['num_affected_rows', 'num_updated_rows', 'num_deleted_rows', 'num_inserted_rows'], rows: [[upd + del + ins, upd, del, ins]] };
    }
    ddlCreate(st) {
      const name = st.name[st.name.length - 1];
      const exists = this.tables.has(lc(name));
      if (exists && !st.orReplace) { if (st.ifNotExists) return msg(`Table ${name} already exists; nothing changed.`); throw new SqlError('TABLE_OR_VIEW_ALREADY_EXISTS', `Cannot create table or view ${bt(name)} because it already exists. Choose a different name, drop the existing object, add the IF NOT EXISTS clause to tolerate pre-existing objects, or add the OR REPLACE clause.`); }
      if (st.q) {
        const plan = planQuery(st.q, { db: this, ctes: new Map() }, null);
        const rows = plan.run(null).map(r => r.filter((_, i) => !plan.cols[i].hidden));
        const vis = plan.cols.filter(c => !c.hidden);
        const cols = st.cols || vis.map((c, i) => { const v = rows.map(r => r[i]).find(x => x != null); const ty = v == null ? 'STRING' : typeOf(v); return { name: c.name, type: { base: ty.startsWith('ARRAY') ? 'ARRAY' : ty === 'STRUCT' ? 'STRUCT' : ty === 'MAP' ? 'MAP' : ty, el: { base: 'STRING' }, fields: [] } }; });
        const names = new Set();
        cols.forEach(c => { if (names.has(lc(c.name))) throw new SqlError('COLUMN_ALREADY_EXISTS', `The column ${bt(c.name)} already exists. Give each output column a unique alias.`); names.add(lc(c.name)); });
        this.tables.set(lc(name), { name, cols, rows: st.cols ? [] : rows, temp: st.temp });
        if (st.cols) this.tables.get(lc(name)).rows = rows.map(r => this.coerceRow(this.tables.get(lc(name)), r));
        return { kind: 'rows', columns: ['num_affected_rows', 'num_inserted_rows'], rows: [[rows.length, rows.length]] };
      }
      this.tables.set(lc(name), { name, cols: st.cols, rows: [], temp: st.temp });
      return msg(`Table ${name} created.`);
    }
  }
  const msg = m => ({ kind: 'message', columns: [], rows: [], message: m });

  /* ================= planning ================= */
  /* plan = { cols: [{name, table, hidden}], run(outerEnv) → rows } */
  function planQuery(q, ctx, outer) {
    switch (q.k) {
      case 'with': return planWith(q, ctx, outer);
      case 'select': return planSelect(q, ctx, outer);
      case 'setop': return planSetop(q, ctx, outer);
      case 'wrap': {
        const inner = planQuery(q.q, ctx, outer);
        if (!q.orderBy && q.limit == null && q.offset == null) return inner;
        const scope = new Scope(inner.cols.map(c => ({ name: c.name, table: null, hidden: c.hidden })), outer);
        const order = q.orderBy ? q.orderBy.map(o => orderTerm(o, scope, ctx, inner.cols)) : null;
        const lim = limits(q, ctx);
        return { cols: inner.cols, run(env) { let rows = inner.run(env); if (order) rows = sortRows(rows.map(r => ({ out: r, env: { row: r, parent: env } })), order).map(x => x.out); return lim(rows); } };
      }
      default: throw new SqlError('INTERNAL_ERROR', 'Unknown query node ' + q.k);
    }
  }
  function planWith(q, ctx, outer) {
    const ctes = new Map(ctx.ctes);
    const inner = Object.assign({}, ctx, { ctes });
    for (const c of q.w.ctes) {
      const name = lc(c.name);
      if (q.w.recursive && c.q.k === 'setop' && c.q.op === 'UNION' && referencesTable(c.q.r, name)) {
        const anchor = planQuery(c.q.l, inner, outer);
        const cols = (c.cols || anchor.cols.map(x => x.name)).map(n => ({ name: n }));
        const state = { rows: [] };
        ctes.set(name, { cols, rows: () => state.rows, recursiveState: state });
        const step = planQuery(c.q.r, inner, outer);
        if (step.cols.length !== cols.length) throw new SqlError('NUM_COLUMNS_MISMATCH', `The recursive member of CTE ${bt(c.name)} returns ${step.cols.length} columns, but the anchor returns ${cols.length}.`);
        let cache = null;
        ctes.set(name, { cols, rows: env => {
          if (state.running) return state.rows;
          if (cache && !anchor.correlated) return cache;
          state.running = true;
          let all = anchor.run(env), work = all;
          const seen = c.q.all ? null : new Set(all.map(r => keyOf(r)));
          for (let it = 0; work.length; it++) {
            if (it > 1000) { state.running = false; throw new SqlError('RECURSION_LEVEL_LIMIT_EXCEEDED', `Recursion level limit 1000 reached in CTE ${bt(c.name)}. Check the recursive member has a terminating condition.`); }
            state.rows = work;
            let next = step.run(env);
            if (seen) next = next.filter(r => { const k = keyOf(r); if (seen.has(k)) return false; seen.add(k); return true; });
            all = all.concat(next); work = next;
            if (all.length > 200000) break;
          }
          state.running = false; state.rows = all; cache = all;
          return all;
        } });
        continue;
      }
      const p = planQuery(c.q, inner, outer);
      const cols = c.cols ? c.cols.map(n => ({ name: n })) : p.cols.map(x => ({ name: x.name, hidden: x.hidden }));
      if (c.cols && c.cols.length !== p.cols.filter(x => !x.hidden).length) throw new SqlError('NUM_COLUMNS_MISMATCH', `CTE ${bt(c.name)} declares ${c.cols.length} columns but its query returns ${p.cols.length}.`);
      let cache = null, cacheEnv;
      ctes.set(name, { cols, rows: env => { if (cache && (!p.correlated || cacheEnv === env)) return cache; cache = p.run(env); cacheEnv = env; return cache; } });
    }
    const body = planQuery(q.q, inner, outer);
    return body;
  }
  function referencesTable(q, name) { let hit = false; walk(q, n => { if (n.k === 'table' && lc(n.name[n.name.length - 1]) === name) hit = true; }); return hit; }

  function planSetop(q, ctx, outer) {
    const l = planQuery(q.l, ctx, outer), r = planQuery(q.r, ctx, outer);
    const lv = l.cols.filter(c => !c.hidden), rv = r.cols.filter(c => !c.hidden);
    if (lv.length !== rv.length) throw new SqlError('NUM_COLUMNS_MISMATCH', `${q.op} can only be performed on inputs with the same number of columns, but the first input has ${lv.length} columns and the second input has ${rv.length} columns.`);
    const strip = (p, rows) => rows.map(row => row.filter((_, i) => !p.cols[i].hidden));
    return {
      cols: lv.map(c => ({ name: c.name })),
      get correlated() { return l.correlated || r.correlated; },
      run(env) {
        const a = strip(l, l.run(env)), b = strip(r, r.run(env));
        if (q.op === 'UNION') { if (q.all) return a.concat(b); const seen = new Set(); return a.concat(b).filter(row => { const k = keyOf(row); if (seen.has(k)) return false; seen.add(k); return true; }); }
        const counts = new Map(); b.forEach(row => { const k = keyOf(row); counts.set(k, (counts.get(k) || 0) + 1); });
        const out = [], emitted = new Set();
        for (const row of a) {
          const k = keyOf(row), c = counts.get(k) || 0;
          if (q.op === 'INTERSECT') { if (c > 0) { if (q.all) { out.push(row); counts.set(k, c - 1); } else if (!emitted.has(k)) { out.push(row); emitted.add(k); } } }
          else if (q.all) { if (c > 0) counts.set(k, c - 1); else out.push(row); }
          else if (!c && !emitted.has(k)) { out.push(row); emitted.add(k); }
        }
        return out;
      },
    };
  }

  /* ---------- FROM ---------- */
  function planFrom(f, ctx, outer) {
    switch (f.k) {
      case 'table': {
        const name = lc(f.name[f.name.length - 1]);
        const alias = f.alias || f.name[f.name.length - 1];
        if (f.name.length === 1 && ctx.ctes.has(name)) {
          const c = ctx.ctes.get(name);
          return { cols: c.cols.map(x => ({ name: x.name, table: alias, hidden: x.hidden })), run: env => c.rows(env) };
        }
        const t = ctx.db.table(f.name);
        if (t.view) {
          const p = planQuery(t.view, { db: ctx.db, ctes: new Map() }, null);
          return { cols: p.cols.map(x => ({ name: x.name, table: alias, hidden: x.hidden })), run: () => p.run(null) };
        }
        return { cols: t.cols.map(c => ({ name: c.name, table: alias, type: c.type })), run: () => { ctx.db.stats.rowsScanned += t.rows.length; return t.rows; } };
      }
      case 'subquery': {
        const p = planQuery(f.q, ctx, outer);
        const names = f.colAliases || p.cols.map(c => c.name);
        if (f.colAliases && f.colAliases.length !== p.cols.filter(c => !c.hidden).length) throw new SqlError('NUM_COLUMNS_MISMATCH', `The derived table ${bt(f.alias)} has ${p.cols.length} columns but ${f.colAliases.length} column aliases.`);
        return { cols: p.cols.map((c, i) => ({ name: names[i], table: f.alias || null, hidden: c.hidden })), run: env => p.run(env), correlated: p.correlated, lateral: f.lateral, plan: p };
      }
      case 'values': {
        const scope = new Scope([], outer);
        const rows = f.rows.map(r => r.map(e => compile(e, scope, ctx)));
        const width = f.rows[0].length;
        if (f.rows.some(r => r.length !== width)) throw new SqlError('INVALID_INLINE_TABLE.NUM_COLUMNS_MISMATCH', 'All rows of an inline table must have the same number of columns.');
        const names = f.colAliases || Array.from({ length: width }, (_, i) => `col${i + 1}`);
        return { cols: names.map(n => ({ name: n, table: f.alias || null })), run: env => rows.map(r => r.map(fn => fn(env))) };
      }
      case 'tvf': return planTvf(f, ctx, outer);
      case 'join': return planJoin(f, ctx, outer);
      default: throw new SqlError('INTERNAL_ERROR', 'Unknown FROM item ' + f.k);
    }
  }
  function planTvf(f, ctx, outer) {
    const scope = new Scope([], outer);
    const args = f.args.map(a => compile(a, scope, ctx));
    const alias = f.alias || null;
    const named = (names) => (f.colAliases || names).map(n => ({ name: n, table: alias }));
    if (f.name === 'range') {
      return { cols: named(['id']), run: env => { const v = args.map(a => a(env)); let [s, e, st] = v.length === 1 ? [0, v[0], 1] : [v[0], v[1], v[2] || 1]; const out = []; for (let i = s; st > 0 ? i < e : i > e; i += st) out.push([i]); return out; } };
    }
    if (GENERATORS.has(f.name)) {
      const gen = generator(f.name);
      const probe = { cols: generatorCols(gen, f.name, f.args[0], scope) };
      return { cols: named(probe.cols), run: env => { const out = []; gen.expand(args[0](env), out, []); return out; }, dynamicCols: gen.dynamic };
    }
    throw new SqlError('UNRESOLVED_ROUTINE', `Cannot resolve table function ${bt(f.name)}. Supported here: range, explode, explode_outer, posexplode, inline.`);
  }
  function generator(name) {
    const outer = name.endsWith('_outer');
    const base = name.replace('_outer', '');
    return {
      cols: base === 'posexplode' ? ['pos', 'col'] : base === 'inline' ? [] : ['col'],
      dynamic: base === 'inline',
      expand(v, out, prefix) {
        if ((base === 'explode' || base === 'posexplode') && v instanceof Map) { if (!v.size && outer) out.push(prefix.concat(base === 'posexplode' ? [null, null, null] : [null, null])); let i = 0; v.forEach((x, k) => out.push(prefix.concat(base === 'posexplode' ? [i++, k, x] : [k, x]))); return; }
        const arr = v == null ? [] : Array.isArray(v) ? v : (() => { throw new SqlError('DATATYPE_MISMATCH.UNEXPECTED_INPUT_TYPE', `${name} expects an ARRAY or MAP, got ${typeOf(v)}.`); })();
        if (!arr.length) { if (outer) out.push(prefix.concat(base === 'posexplode' ? [null, null] : [null])); return; }
        arr.forEach((x, i) => {
          if (base === 'posexplode') out.push(prefix.concat([i, x]));
          else if (base === 'inline') out.push(prefix.concat(x == null ? [] : Object.values(x)));
          else out.push(prefix.concat([x]));
        });
      },
    };
  }
  function planJoin(j, ctx, outer) {
    const L = planFrom(j.l, ctx, outer);
    const lscope = new Scope(L.cols, outer);
    const R = j.r.lateral || (j.r.k === 'tvf' && j.r.lateral) ? planFrom(j.r, ctx, lscope) : planFrom(j.r, ctx, outer);
    const lateral = !!(j.r.lateral);
    const type = j.type;
    let cols = type === 'semi' || type === 'anti' ? L.cols.slice() : L.cols.concat(R.cols);
    let using = j.using;
    if (j.natural) using = L.cols.filter(c => !c.hidden && R.cols.some(r => !r.hidden && lc(r.name) === lc(c.name))).map(c => c.name);
    const scope = new Scope(L.cols.concat(R.cols), outer);
    let cond = null, equi = null;
    if (using) {
      const pairs = using.map(u => {
        const li = L.cols.findIndex(c => !c.hidden && lc(c.name) === lc(u)), ri = R.cols.findIndex(c => !c.hidden && lc(c.name) === lc(u));
        if (li < 0 || ri < 0) throw new SqlError('UNRESOLVED_USING_COLUMN_FOR_JOIN', `USING column ${bt(u)} cannot be resolved on the ${li < 0 ? 'left' : 'right'} side of the join. The ${li < 0 ? 'left' : 'right'}-side columns: [${(li < 0 ? L : R).cols.map(c => bt(c.name)).join(', ')}].`);
        return [li, ri];
      });
      equi = pairs.map(([li, ri]) => [env => env.row[li], env => env.row[ri]]);
      equi.idx = pairs;
      cond = env => pairs.every(([li, ri]) => { const a = env.row[li], b = env.row[L.cols.length + ri]; return a != null && b != null && compare(a, b) === 0; });
    } else if (j.on) {
      cond = compile(j.on, scope, ctx);
      equi = extractEqui(j.on, L.cols.length, scope, ctx);
    }
    const nl = L.cols.length, nr = R.cols.length;
    const nullsL = new Array(nl).fill(null), nullsR = new Array(nr).fill(null);
    let outCols = cols;
    let project = null;
    if (using && type !== 'semi' && type !== 'anti') {
      const pairs = equi.idx;
      const merged = pairs.map(([li]) => ({ name: L.cols[li].name, table: null }));
      const hideL = new Set(pairs.map(p => p[0])), hideR = new Set(pairs.map(p => nl + p[1]));
      outCols = merged.concat(L.cols.map((c, i) => (hideL.has(i) ? Object.assign({}, c, { hidden: true, usingHidden: true }) : c)), R.cols.map((c, i) => (hideR.has(nl + i) ? Object.assign({}, c, { hidden: true, usingHidden: true }) : c)));
      project = row => pairs.map(([li, ri]) => (row[li] != null ? row[li] : row[nl + ri])).concat(row);
      // qualified access (o.id) must still work for hidden using columns
      outCols.forEach(c => { if (c.usingHidden) c.qualifiedOnly = true; });
    }
    return {
      cols: outCols.map(c => (c.qualifiedOnly ? Object.assign({}, c, { hidden: true }) : c)),
      get correlated() { return L.correlated || (!lateral && R.correlated); },
      run(env) {
        const lrows = L.run(env);
        const out = [];
        const emit = row => out.push(project ? project(row) : row);
        if (lateral) {
          for (const lr of lrows) {
            const rrows = R.run({ row: lr, parent: env });
            let any = false;
            for (const rr of rrows) { const row = lr.concat(rr); if (!cond || truthy(cond({ row, parent: env }))) { any = true; if (type === 'semi') { emit(lr); break; } if (type !== 'anti') emit(row); } }
            if (!any && (type === 'left' || type === 'anti')) emit(type === 'anti' ? lr : lr.concat(nullsR));
          }
          return out;
        }
        const rrows = R.run(env);
        const rMatched = type === 'right' || type === 'full' ? new Array(rrows.length).fill(false) : null;
        let index = null;
        if (equi && equi.length && type !== 'cross') {
          index = new Map();
          rrows.forEach((rr, ri) => {
            const k = equi.map(([, rf]) => rf({ row: rr, parent: env }));
            if (k.some(v => v == null)) return;
            const key = k.map(keyOf).join('\u0003');
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(ri);
          });
        }
        for (const lr of lrows) {
          let candidates;
          if (index) { const k = equi.map(([lf]) => lf({ row: lr, parent: env })); candidates = k.some(v => v == null) ? [] : index.get(k.map(keyOf).join('\u0003')) || []; }
          else candidates = null;
          let any = false;
          const tryOne = ri => {
            const row = lr.concat(rrows[ri]);
            if (type === 'cross' || !cond || truthy(cond({ row, parent: env }))) {
              any = true;
              if (rMatched) rMatched[ri] = true;
              if (type === 'semi' || type === 'anti') return true;
              emit(row);
            }
            return false;
          };
          if (candidates) { for (const ri of candidates) if (tryOne(ri)) break; }
          else for (let ri = 0; ri < rrows.length; ri++) if (tryOne(ri)) break;
          if (type === 'semi' && any) emit(lr);
          if (type === 'anti' && !any) emit(lr);
          if (!any && (type === 'left' || type === 'full')) emit(lr.concat(nullsR));
        }
        if (rMatched) rrows.forEach((rr, i) => { if (!rMatched[i]) emit(nullsL.concat(rr)); });
        return out;
      },
    };
  }
  /* Find `left.col = right.col` conjuncts so the join can use a hash index. */
  function extractEqui(on, nl, scope, ctx) {
    const conj = [];
    const split = e => { if (e.k === 'bin' && e.op === 'AND') { split(e.l); split(e.r); } else conj.push(e); };
    split(on);
    const out = [];
    for (const c of conj) {
      if (c.k !== 'bin' || c.op !== '=') continue;
      const side = e => { let s = null, ok = true; walk(e, n => { if (n.k === 'subq' || n.k === 'exists') { ok = false; return false; } if (n.k === 'col') { try { const r = scope.resolve(n.parts); if (!r || r.depth > 0) return; const sd = r.index < nl ? 'L' : 'R'; if (s && s !== sd) ok = false; s = sd; } catch (e2) { ok = false; } } }); return ok ? s : 'X'; };
      const a = side(c.l), b = side(c.r);
      if ((a === 'L' && b === 'R') || (a === 'R' && b === 'L')) {
        const [le, re] = a === 'L' ? [c.l, c.r] : [c.r, c.l];
        const lf = compile(le, scope, ctx), rfRaw = compile(re, scope, ctx);
        const pad = new Array(nl).fill(null);
        out.push([lf, env => rfRaw({ row: pad.concat(env.row), parent: env.parent })]);
      }
    }
    return out;
  }

  /* ---------- SELECT ---------- */
  function planSelect(q, ctx, outer) {
    const boundary = { correlated: false };
    let from = q.from ? planFrom(q.from, ctx, outer) : { cols: [], run: () => [[]] };
    // LATERAL VIEW explode(...)
    for (const lv of q.laterals || []) {
      const base = from;
      const scope = new Scope(base.cols, outer);
      if (lv.fn.k !== 'fn' || !GENERATORS.has(lv.fn.name)) throw new SqlError('UNSUPPORTED_GENERATOR', 'LATERAL VIEW needs a generator function such as explode, posexplode or inline.');
      const gen = generator(lv.outer && !lv.fn.name.endsWith('_outer') ? lv.fn.name + '_outer' : lv.fn.name);
      const arg = compile(lv.fn.args[0], scope, ctx);
      const names = lv.cols.length ? lv.cols : generatorCols(gen, lv.fn.name, lv.fn.args[0], scope);
      from = { cols: base.cols.concat(names.map(n => ({ name: n, table: lv.alias }))), run: env => { const out = []; for (const r of base.run(env)) gen.expand(arg({ row: r, parent: env }), out, r); return out; }, get correlated() { return base.correlated; } };
    }
    const S0 = new Scope(from.cols, outer, boundary);
    const where = q.where ? compile(q.where, S0, ctx, { noAgg: 'WHERE' }) : null;
    if (q.where) checkNoWindow(q.where, 'WHERE');

    // expand stars against the FROM scope
    const items = [];
    for (const it of q.items) {
      if (it.e.k === 'star') {
        const tbl = it.e.table;
        if (tbl && !from.cols.some(c => lc(c.table || '') === lc(tbl))) throw new SqlError('CANNOT_RESOLVE_STAR_EXPAND', `Cannot resolve ${bt(tbl)}.* given input columns ${from.cols.filter(c => !c.hidden).map(c => bt(c.name)).join(', ')}.`);
        if (!q.from) throw new SqlError('INVALID_USAGE_OF_STAR_OR_REGEX', 'Invalid usage of `*` in a query without FROM.');
        const except = (it.e.except || []).map(lc);
        except.forEach(x => { if (!from.cols.some(c => lc(c.name) === x)) throw new SqlError('UNRESOLVED_COLUMN.WITH_SUGGESTION', `A column with name ${bt(x)} in SELECT * EXCEPT cannot be resolved. Did you mean one of the following? [${suggest(x, from.cols.map(c => c.name)).map(bt).join(', ')}].`); });
        from.cols.forEach((c, i) => {
          if (tbl ? lc(c.table || '') !== lc(tbl) || (c.hidden && !c.qualifiedOnly) : c.hidden) return;
          if (except.includes(lc(c.name))) return;
          items.push({ e: { k: 'colref', index: i, name: c.name }, alias: c.name, star: true });
        });
      } else items.push(it);
    }
    const resolveGroupRef = e => {
      if (e.k === 'lit' && typeof e.v === 'number' && Number.isInteger(e.v)) {
        const it = items[e.v - 1];
        if (!it) throw new SqlError('GROUP_BY_POS_OUT_OF_RANGE', `GROUP BY position ${e.v} is not in select list (valid range is [1, ${items.length}]).`);
        return it.e;
      }
      if (e.k === 'col' && e.parts.length === 1) {
        let inFrom = false; try { inFrom = !!S0.resolveLocal(e.parts); } catch (x) { inFrom = true; }
        if (!inFrom) { const it = items.find(x => x.alias && !Array.isArray(x.alias) && lc(x.alias) === lc(e.parts[0])); if (it) return it.e; }
      }
      return e;
    };
    const postGroupNodes = items.map(i => i.e).concat(q.having ? [q.having] : [], q.qualify ? [q.qualify] : [], (q.orderBy || []).map(o => o.e));
    const aggs = collectAggs(postGroupNodes);
    const grouped = !!(q.groupBy || q.groupAll || aggs.length);
    let groupExprs = [];
    if (q.groupAll) groupExprs = items.filter(i => !collectAggs([i.e]).length && !collectWindows([i.e]).length && !(i.e.k === 'lit')).map(i => i.e);
    else if (q.groupBy) groupExprs = q.groupBy.map(resolveGroupRef);
    groupExprs.forEach(e => { if (collectAggs([e]).length) throw new SqlError('GROUP_BY_AGGREGATE', `Aggregate functions are not allowed in GROUP BY, but found ${exprName(collectAggs([e])[0])}.`); });

    let S1 = S0, groupRun = null;
    if (grouped) {
      const keyFps = groupExprs.map(e => fingerprint(e, S0));
      const keyFns = groupExprs.map(e => compile(e, S0, ctx));
      const aggList = [];
      const aggFps = [];
      aggs.forEach(a => { const fp = fingerprint(a, S0); if (!aggFps.includes(fp)) { aggFps.push(fp); aggList.push(a); } });
      const aggImpl = aggList.map(a => compileAgg(a, S0, ctx));
      const sets = q.groupingSets ? q.groupingSets.map(set => set.map(e => fingerprint(resolveGroupRef(e), S0))) : null;
      const nk = groupExprs.length;
      const cols = groupExprs.map((e, i) => ({ name: exprName(e), table: null, keyIndex: i })).concat(aggList.map(a => ({ name: exprName(a) })), [{ name: '__grouping_id', hidden: true }]);
      S1 = new Scope(cols, outer, boundary);
      S1.group = { keyFps, aggFps, S0, nk };
      S1.resolver = parts => {
        let r;
        try { r = S0.resolveLocal(parts); } catch (e) { throw e; }
        if (!r) return null;
        const fp = `#c0:${r.index}:`;
        const ki = keyFps.indexOf(fingerprint({ k: 'col', parts: parts.slice(0, parts.length - r.rest.length) }, S0));
        if (ki >= 0) return { index: ki, rest: r.rest };
        const kExact = keyFps.indexOf(fingerprint({ k: 'col', parts }, S0));
        if (kExact >= 0) return { index: kExact, rest: [] };
        void fp;
        throw new SqlError('MISSING_AGGREGATION', `The non-aggregating expression ${bt(parts.join('.'))} is based on columns which are not participating in the GROUP BY clause. Add the columns or the expression to the GROUP BY, aggregate the expression, or use \`any_value(${parts.join('.')})\` if you do not care which of the values within a group is returned.`);
      };
      groupRun = rows => {
        const out = [];
        const doSet = (setFps, gid) => {
          const groups = new Map();
          const active = setFps ? keyFps.map(fp => setFps.includes(fp)) : keyFps.map(() => true);
          for (const env of rows) {
            const keys = keyFns.map((f, i) => (active[i] ? f(env) : null));
            const k = keys.map(keyOf).join('\u0003');
            let g = groups.get(k);
            if (!g) { g = { keys, envs: [] }; groups.set(k, g); }
            g.envs.push(env);
          }
          if (!groups.size && !nk) groups.set('', { keys: [], envs: [] });
          for (const g of groups.values()) out.push(g.keys.concat(aggImpl.map(a => a(g.envs)), [gid]));
        };
        if (sets) sets.forEach((s, i) => doSet(s, keyFps.reduce((m, fp, j) => m | (s.includes(fp) ? 0 : 1 << (nk - 1 - j)), 0)));
        else doSet(null, 0);
        return out;
      };
    }
    const aliasMap = new Map();
    items.forEach(it => { if (it.alias && !Array.isArray(it.alias) && !it.star && !hasGenerator(it.e)) aliasMap.set(lc(it.alias), it.e); });
    const having = q.having ? compile(q.having, S1, ctx, { aliases: aliasMap }) : null;

    // window functions
    const winNodes = collectWindows(items.map(i => i.e).concat(q.qualify ? [q.qualify] : [], (q.orderBy || []).map(o => o.e)));
    let S2 = S1, windowRun = null;
    if (winNodes.length) {
      const fps = [], uniqNodes = [];
      winNodes.forEach(w => { const fp = fingerprint(w, S1); if (!fps.includes(fp)) { fps.push(fp); uniqNodes.push(w); } });
      const impl = uniqNodes.map(w => compileWindow(w, S1, ctx, q.windows || {}));
      S2 = new Scope(S1.cols.concat(uniqNodes.map(w => ({ name: exprName(w) }))), outer, boundary);
      S2.resolver = S1.resolver ? parts => S1.resolver(parts) : null;
      if (!S2.resolver) S2.resolver = parts => S1.resolveLocal(parts);
      S2.windowFps = { fps, base: S1.cols.length, S1 };
      if (S1.group) S2.group = S1.group;
      windowRun = envs => {
        const cols = impl.map(f => f(envs));
        return envs.map((env, i) => ({ row: env.row.concat(cols.map(c => c[i])), parent: env.parent }));
      };
    }
    const qualify = q.qualify ? compile(q.qualify, S2, ctx, { aliases: aliasMap }) : null;

    // projection
    const genIdx = items.findIndex(i => hasGenerator(i.e));
    if (items.filter(i => hasGenerator(i.e)).length > 1) throw new SqlError('UNSUPPORTED_GENERATOR.MULTI_GENERATOR', 'Only one generator is allowed per SELECT clause. Use LATERAL VIEW for the others.');
    const outCols = [];
    const proj = items.map((it, idx) => {
      if (idx === genIdx) {
        const g = generator(it.e.name);
        const arg = compile(it.e.args[0], S2, ctx);
        const names = Array.isArray(it.alias) ? it.alias : it.alias ? [it.alias] : generatorCols(g, it.e.name, it.e.args[0], S2);
        names.forEach(n => outCols.push({ name: n }));
        return { gen: g, arg, width: names.length };
      }
      const earlier = new Map(); items.slice(0, idx).forEach(x => { if (x.alias && !Array.isArray(x.alias) && !x.star && !hasGenerator(x.e)) earlier.set(lc(x.alias), x.e); });
      const f = it.e.k === 'colref' ? (S2 === S0 ? env => env.row[it.e.index] : compile({ k: 'col', parts: [from.cols[it.e.index].table, from.cols[it.e.index].name].filter(Boolean) }, S2, ctx)) : compile(it.e, S2, ctx, { aliases: earlier });
      outCols.push({ name: Array.isArray(it.alias) ? it.alias[0] : it.alias || exprName(it.e) });
      return { f };
    });
    const outScope = new Scope(outCols.map(c => ({ name: c.name, table: null })), outer);
    const order = q.orderBy ? q.orderBy.map(o => orderTerm(o, S2, ctx, outCols, items, q.distinct)) : null;
    const lim = limits(q, ctx);
    void outScope;

    return {
      cols: outCols,
      get correlated() { return boundary.correlated || !!from.correlated; },
      run(outerEnv) {
        let envs = from.run(outerEnv).map(row => ({ row, parent: outerEnv }));
        if (where) envs = envs.filter(e => truthy(where(e)));
        if (groupRun) envs = groupRun(envs).map(row => ({ row, parent: outerEnv }));
        if (having) envs = envs.filter(e => truthy(having(e)));
        if (windowRun) envs = windowRun(envs);
        if (qualify) envs = envs.filter(e => truthy(qualify(e)));
        let rows = [];
        for (const env of envs) {
          if (genIdx < 0) { rows.push({ out: proj.map(p => p.f(env)), env }); continue; }
          const pre = proj.slice(0, genIdx).map(p => p.f(env)), post = proj.slice(genIdx + 1).map(p => p.f(env));
          const tmp = [];
          proj[genIdx].gen.expand(proj[genIdx].arg(env), tmp, []);
          tmp.forEach(g => rows.push({ out: pre.concat(g.slice(0, proj[genIdx].width), post), env }));
        }
        if (q.distinct) { const seen = new Set(); rows = rows.filter(r => { const k = keyOf(r.out); if (seen.has(k)) return false; seen.add(k); return true; }); }
        if (order) rows = sortRows(rows, order);
        return lim(rows.map(r => r.out));
      },
    };
  }
  function checkNoWindow(node, where) { if (collectWindows([node]).length) throw new SqlError('UNSUPPORTED_EXPR_FOR_WINDOW', `Window functions are not allowed in ${where}. Compute them in a subquery or CTE, or filter them with QUALIFY.`); }
  function limits(q, ctx) {
    const scope = new Scope([], null);
    const l = q.limit != null ? compile(q.limit, scope, ctx)({}) : null;
    const o = q.offset != null ? compile(q.offset, scope, ctx)({}) : 0;
    if (l != null && (typeof l !== 'number' || l < 0)) throw new SqlError('INVALID_LIMIT_LIKE_EXPRESSION.IS_NEGATIVE', 'The limit expression must be equal to or greater than 0.');
    return rows => (o || l != null ? rows.slice(o || 0, l == null ? undefined : (o || 0) + l) : rows);
  }
  /* ORDER BY: output ordinals and aliases first, then any expression over the source. */
  function orderTerm(o, scope, ctx, outCols, items, distinct) {
    let f;
    if (o.e.k === 'lit' && typeof o.e.v === 'number' && Number.isInteger(o.e.v)) {
      const i = o.e.v - 1;
      if (i < 0 || i >= outCols.length) throw new SqlError('ORDER_BY_POS_OUT_OF_RANGE', `ORDER BY position ${o.e.v} is not in select list (valid range is [1, ${outCols.length}]).`);
      f = (env, out) => out[i];
    } else if (o.e.k === 'col' && o.e.parts.length === 1 && outCols.some(c => lc(c.name) === lc(o.e.parts[0]))) {
      const matches = outCols.map((c, i) => [c, i]).filter(([c]) => lc(c.name) === lc(o.e.parts[0]));
      const i = matches[0][1];
      f = (env, out) => out[i];
    } else {
      if (distinct) {
        const fp = items ? fingerprint(o.e, scope) : null;
        const i = items ? items.findIndex(it => fingerprint(it.e, scope) === fp) : -1;
        if (i >= 0) f = (env, out) => out[i];
        else f = compileWithAliases(o.e, scope, ctx, outCols);
      } else f = compileWithAliases(o.e, scope, ctx, outCols);
    }
    return { f, desc: o.desc, nulls: o.nulls || (o.desc ? 'last' : 'first') };
  }
  function compileWithAliases(e, scope, ctx, outCols) {
    const s = new Scope(scope.cols, scope.parent);
    Object.assign(s, { resolver: scope.resolver, group: scope.group, windowFps: scope.windowFps });
    const g = compile(e, s, ctx, { outCols });
    return (env, out) => g(Object.assign({}, env, { out }));
  }
  function sortRows(rows, order) {
    const decorated = rows.map((r, idx) => ({ r, idx, keys: order.map(o => o.f(r.env || { row: r.out }, r.out)) }));
    decorated.sort((a, b) => {
      for (let i = 0; i < order.length; i++) {
        const x = a.keys[i], y = b.keys[i], o = order[i];
        if (x == null || y == null) { if (x == null && y == null) continue; return (x == null) === (o.nulls === 'first') ? -1 : 1; }
        const c = compare(x, y);
        if (c) return o.desc ? -c : c;
      }
      return a.idx - b.idx;
    });
    return decorated.map(d => d.r);
  }

  /* ---------- aggregates ---------- */
  function compileAgg(a, S0, ctx) {
    const name = a.name;
    if (name === 'count' && a.star) {
      const filt = a.filter ? compile(a.filter, S0, ctx) : null;
      return envs => (filt ? envs.filter(e => truthy(filt(e))).length : envs.length);
    }
    if (!AGG[name]) throw new SqlError('UNRESOLVED_ROUTINE', `Cannot resolve aggregate ${bt(name)}.`);
    a.args.forEach(arg => { if (collectAggs([arg]).length) throw new SqlError('NESTED_AGGREGATE_FUNCTION', 'It is not allowed to use an aggregate function in the argument of another aggregate function. Use the inner aggregate in a subquery.'); });
    let args = a.args;
    if ((name === 'percentile_cont' || name === 'percentile_disc') && a.withinGroup) args = [a.args[0], a.withinGroup[0].e];
    const argFns = args.map(x => compile(x, S0, ctx));
    const filt = a.filter ? compile(a.filter, S0, ctx) : null;
    const orderFns = a.withinGroup ? a.withinGroup.map(o => ({ f: compile(o.e, S0, ctx), desc: o.desc, nulls: o.nulls || (o.desc ? 'last' : 'first') })) : null;
    const impl = AGG[name];
    const argc = { count: [1, 9], sum: [1, 1], avg: [1, 1], min: [1, 1], max: [1, 1], max_by: [2, 2], min_by: [2, 2], count_if: [1, 1], percentile: [2, 3], percentile_approx: [2, 3], string_agg: [1, 2], listagg: [1, 2] }[name];
    if (argc && (args.length < argc[0] || args.length > argc[1])) throw new SqlError('WRONG_NUM_ARGS.WITHOUT_SUGGESTION', `The \`${name}\` requires ${argc[0] === argc[1] ? argc[0] : `${argc[0]} to ${argc[1]}`} parameters but the actual number is ${args.length}.`);
    return envs => {
      let es = filt ? envs.filter(e => truthy(filt(e))) : envs;
      if (orderFns) es = sortRows(es.map(e => ({ env: e, out: null })), orderFns.map(o => ({ f: env => o.f(env), desc: o.desc, nulls: o.nulls }))).map(x => x.env);
      let tuples = es.map(e => argFns.map(f => f(e)));
      if (a.distinct) { const seen = new Set(); tuples = tuples.filter(t => { if (t.some(v => v == null)) return false; const k = keyOf(t); if (seen.has(k)) return false; seen.add(k); return true; }); }
      return impl(tuples, false, a.ignoreNulls);
    };
  }

  /* ---------- window functions ---------- */
  function compileWindow(w, S, ctx, named) {
    let spec = w.over.ref && !w.over.partition ? named[w.over.ref] : w.over;
    if (w.over.ref && w.over.partition) { const base = named[w.over.ref]; spec = Object.assign({}, base, { order: w.over.order.length ? w.over.order : base.order, frame: w.over.frame || base.frame }); }
    if (!spec) throw new SqlError('MISSING_WINDOW_SPECIFICATION', `Window specification ${bt(w.over.ref)} is not defined in the WINDOW clause.`);
    const name = w.name;
    if (!WINDOW_ONLY.has(name) && !AGG[name] && name !== 'count') throw new SqlError('UNSUPPORTED_EXPR_FOR_WINDOW', `Expression ${bt(name)} not supported within a window function.`);
    if (['row_number', 'rank', 'dense_rank', 'percent_rank', 'cume_dist', 'ntile', 'lag', 'lead'].includes(name) && !spec.order.length) throw new SqlError('MISSING_ORDER_BY_FOR_WINDOW', `Window function ${bt(name)} requires the window to be ordered. Add ORDER BY to the OVER clause, for example ${name}() OVER (PARTITION BY … ORDER BY …).`);
    const part = spec.partition.map(e => compile(e, S, ctx));
    const ord = spec.order.map(o => ({ f: compile(o.e, S, ctx), desc: o.desc, nulls: o.nulls || (o.desc ? 'last' : 'first') }));
    const args = (w.args || []).map(a => compile(a, S, ctx));
    const filt = w.filter ? compile(w.filter, S, ctx) : null;
    const frame = spec.frame || (spec.order.length ? { unit: 'RANGE', start: { t: 'up' }, end: { t: 'cur' } } : { unit: 'ROWS', start: { t: 'up' }, end: { t: 'uf' } });
    const constant = node => compile(node, new Scope([], null), ctx)({});
    const fs = frame.start.n ? constant(frame.start.n) : 0, fe = frame.end.n ? constant(frame.end.n) : 0;
    return envs => {
      const out = new Array(envs.length);
      const parts = new Map();
      envs.forEach((e, i) => { const k = part.map(f => keyOf(f(e))).join('\u0003'); if (!parts.has(k)) parts.set(k, []); parts.get(k).push(i); });
      for (const idxs of parts.values()) {
        const keys = idxs.map(i => ord.map(o => o.f(envs[i])));
        const order = idxs.map((_, j) => j).sort((a, b) => {
          for (let t = 0; t < ord.length; t++) {
            const x = keys[a][t], y = keys[b][t], o = ord[t];
            if (x == null || y == null) { if (x == null && y == null) continue; return (x == null) === (o.nulls === 'first') ? -1 : 1; }
            const c = compare(x, y); if (c) return o.desc ? -c : c;
          }
          return a - b;
        });
        const rowsI = order.map(j => idxs[j]);
        const k = order.map(j => keys[j]);
        const n = rowsI.length;
        const peerEq = (a, b) => ord.every((_, t) => { const x = k[a][t], y = k[b][t]; return (x == null && y == null) || (x != null && y != null && compare(x, y) === 0); });
        const peerStart = new Array(n), peerEnd = new Array(n);
        for (let i = 0; i < n; i++) peerStart[i] = i > 0 && peerEq(i, i - 1) ? peerStart[i - 1] : i;
        for (let i = n - 1; i >= 0; i--) peerEnd[i] = i < n - 1 && peerEq(i, i + 1) ? peerEnd[i + 1] : i;
        const val = (pos, a) => args[a](envs[rowsI[pos]]);
        const bounds = i => {
          let s, e;
          if (frame.unit === 'ROWS') {
            s = frame.start.t === 'up' ? 0 : frame.start.t === 'cur' ? i : frame.start.t === 'p' ? i - fs : frame.start.t === 'f' ? i + fs : n;
            e = frame.end.t === 'uf' ? n - 1 : frame.end.t === 'cur' ? i : frame.end.t === 'p' ? i - fe : frame.end.t === 'f' ? i + fe : -1;
          } else {
            if ((frame.start.t === 'p' || frame.start.t === 'f' || frame.end.t === 'p' || frame.end.t === 'f')) {
              const cur = k[i][0];
              const sgn = ord[0] && ord[0].desc ? -1 : 1;
              const within = (j, lo, hi) => { const v = k[j][0]; if (v == null || cur == null) return false; const d = (typeof v === 'number' ? v - cur : X.num(v) - X.num(cur)) * sgn; return d >= lo && d <= hi; };
              const lo = frame.start.t === 'up' ? -Infinity : frame.start.t === 'cur' ? 0 : frame.start.t === 'p' ? -fs : fs;
              const hi = frame.end.t === 'uf' ? Infinity : frame.end.t === 'cur' ? 0 : frame.end.t === 'p' ? -fe : fe;
              s = n; e = -1;
              for (let j = 0; j < n; j++) if (within(j, lo, hi)) { if (j < s) s = j; e = j; }
              if (s > e) { s = 1; e = 0; }
            } else {
              s = frame.start.t === 'up' ? 0 : peerStart[i];
              e = frame.end.t === 'uf' ? n - 1 : peerEnd[i];
            }
          }
          return [Math.max(0, s), Math.min(n - 1, e)];
        };
        let rank = 0, dense = 0;
        for (let i = 0; i < n; i++) {
          let v;
          switch (name) {
            case 'row_number': v = i + 1; break;
            case 'rank': if (peerStart[i] === i) rank = i + 1; v = rank; break;
            case 'dense_rank': if (peerStart[i] === i) dense++; v = dense; break;
            case 'percent_rank': v = n === 1 ? 0 : peerStart[i] / (n - 1); break;
            case 'cume_dist': v = (peerEnd[i] + 1) / n; break;
            case 'ntile': { const b = args[0](envs[rowsI[i]]); const size = Math.floor(n / b), rem = n % b; let acc = 0, t = 1; for (; t <= b; t++) { acc += size + (t <= rem ? 1 : 0); if (i < acc) break; } v = t; break; }
            case 'lag': case 'lead': {
              const off = args[1] ? args[1](envs[rowsI[i]]) : 1;
              const j = name === 'lag' ? i - off : i + off;
              v = j >= 0 && j < n ? val(j, 0) : args[2] ? args[2](envs[rowsI[i]]) : null;
              if (w.ignoreNulls && j >= 0 && j < n) { let jj = i; let c = 0; v = args[2] ? args[2](envs[rowsI[i]]) : null; while (true) { jj += name === 'lag' ? -1 : 1; if (jj < 0 || jj >= n) break; const x = val(jj, 0); if (x != null && ++c === off) { v = x; break; } } }
              break;
            }
            case 'nth_value': { const [s, e] = bounds(i); const nth = args[1](envs[rowsI[i]]); let c = 0; v = null; for (let j = s; j <= e; j++) { const x = val(j, 0); if (w.ignoreNulls && x == null) continue; if (++c === nth) { v = x; break; } } break; }
            default: {
              const [s, e] = bounds(i);
              const tuples = [];
              for (let j = s; j <= e; j++) { const env = envs[rowsI[j]]; if (filt && !truthy(filt(env))) continue; tuples.push(w.star ? [] : args.map(a => a(env))); }
              let t = tuples;
              if (w.distinct) { const seen = new Set(); t = tuples.filter(x => { if (x.some(y => y == null)) return false; const kk = keyOf(x); if (seen.has(kk)) return false; seen.add(kk); return true; }); }
              const impl = name === 'count' ? AGG.count : AGG[name];
              v = impl(t, !!w.star, !!w.ignoreNulls);
            }
          }
          out[rowsI[i]] = v;
        }
      }
      return out;
    };
  }

  /* ================= expressions ================= */
  function compile(node, scope, ctx, opts) {
    opts = opts || {};
    // In grouped or windowed scopes, whole expressions can match a group key, an aggregate or a window result.
    if (scope.windowFps && node.k === 'fn' && node.over) {
      const fp = fingerprint(node, scope.windowFps.S1);
      const i = scope.windowFps.fps.indexOf(fp);
      if (i >= 0) { const idx = scope.windowFps.base + i; return env => env.row[idx]; }
    }
    if (scope.group && node.k !== 'lit') {
      const fp = fingerprint(node, scope.group.S0);
      const ki = scope.group.keyFps.indexOf(fp);
      if (ki >= 0) return env => env.row[ki];
      const ai = scope.group.aggFps.indexOf(fp);
      if (ai >= 0) { const idx = scope.group.nk + ai; return env => env.row[idx]; }
    }
    if (opts.noAgg && isAggCall(node)) throw new SqlError('INVALID_WHERE_CONDITION', `The ${opts.noAgg} condition ${bt(exprName(node))} contains an aggregate function. Use HAVING to filter on aggregates, or QUALIFY for window functions.`);
    const c = n => compile(n, scope, ctx, opts);
    switch (node.k) {
      case 'lit': { const v = node.v; return () => v; }
      case 'colref': { const i = node.index; return env => env.row[i]; }
      case 'col': {
        if (opts.outCols && node.parts.length === 1) {
          let local = null; try { local = scope.resolve(node.parts); } catch (e) { local = null; }
          if (!local) { const i = opts.outCols.findIndex(oc => lc(oc.name) === lc(node.parts[0])); if (i >= 0) return env => env.out[i]; }
        }
        if (opts.lambda) { const li = opts.lambda.findIndex(p => lc(p) === lc(node.parts[0])); if (li >= 0) { const rest = node.parts.slice(1); return env => fieldPath(env.lambda[li], rest); } }
        let r;
        try { r = scope.resolve(node.parts); }
        catch (err) { if (err.cls === 'MISSING_AGGREGATION' && opts.aliases && node.parts.length === 1 && opts.aliases.has(lc(node.parts[0]))) r = null; else throw err; }
        if (!r && opts.aliases && node.parts.length === 1 && opts.aliases.has(lc(node.parts[0]))) {
          const target = opts.aliases.get(lc(node.parts[0]));
          const rest = new Map(opts.aliases); rest.delete(lc(node.parts[0]));
          return compile(target, scope, ctx, Object.assign({}, opts, { aliases: rest }));
        }
        if (!r) {
          if (node.parts.length === 1 && /^(current_date|current_timestamp|current_user|now)$/i.test(node.parts[0])) { const f = SCALAR[lc(node.parts[0])] || (() => 'lab_user'); return () => f(); }
          throw unresolved(node.parts, scope);
        }
        const { depth, index, rest } = r;
        if (!rest.length) return depth === 0 ? env => env.row[index] : env => fetch(env, depth, index);
        return env => fieldPath(fetch(env, depth, index), rest);
      }
      case 'field': { const e = c(node.e), name = node.name; return env => fieldPath(e(env), [name]); }
      case 'index': {
        const e = c(node.e), i = c(node.idx);
        return env => { const a = e(env), k = i(env); if (a == null || k == null) return null; if (a instanceof Map) { for (const [kk, v] of a) if (compare(kk, k) === 0) return v; return null; } if (X.isStruct(a)) return a[k] === undefined ? null : a[k]; if (!Array.isArray(a)) throw new SqlError('DATATYPE_MISMATCH.UNEXPECTED_INPUT_TYPE', `Cannot index into ${typeOf(a)}.`); if (k < 0 || k >= a.length) throw new SqlError('INVALID_ARRAY_INDEX', `The index ${k} is out of bounds. The array has ${a.length} elements. Use the SQL function \`get()\` to tolerate accessing element at invalid index and return NULL instead.`); return a[k]; };
      }
      case 'un': {
        const e = c(node.e);
        if (node.op === 'NOT') return env => { const v = e(env); return v == null ? null : !truthy(v); };
        if (node.op === '-') return env => { const v = e(env); return v == null ? null : v instanceof Interval ? new Interval(-v.months, -v.days, -v.ms) : -X.num(v); };
        return env => { const v = e(env); return v == null ? null : ~v; };
      }
      case 'bin': return compileBin(node, c);
      case 'isnull': { const e = c(node.e), not = node.not; return env => (e(env) == null) !== not; }
      case 'istrue': { const e = c(node.e); return env => (e(env) === node.v) !== node.not; }
      case 'distinctfrom': { const l = c(node.l), r = c(node.r), not = node.not; return env => { const a = l(env), b = r(env); const same = (a == null && b == null) || (a != null && b != null && compare(a, b) === 0); return not ? same : !same; }; }
      case 'between': { const e = c(node.e), lo = c(node.lo), hi = c(node.hi), not = node.not; return env => { const v = e(env), a = lo(env), b = hi(env); if (v == null || a == null || b == null) return null; const r = compare(v, a) >= 0 && compare(v, b) <= 0; return not ? !r : r; }; }
      case 'like': {
        const e = c(node.e), not = node.not;
        const test = (v, p) => (node.op === 'RLIKE' ? javaRe(p).test(v) : likeRe(p, node.op === 'ILIKE', node.escape).test(v));
        if (node.pats) { const pats = node.pats.map(c); return env => { const v = e(env); if (v == null) return null; const res = pats.map(p => { const pv = p(env); return pv == null ? null : test(X.toStr(v), pv); }); const r = node.quant === 'ALL' ? (res.includes(false) ? false : res.includes(null) ? null : true) : (res.includes(true) ? true : res.includes(null) ? null : false); return r == null ? null : not ? !r : r; }; }
        const p = c(node.pat);
        return env => { const v = e(env), pv = p(env); if (v == null || pv == null) return null; const r = test(X.toStr(v), pv); return not ? !r : r; };
      }
      case 'in': {
        const e = c(node.e), not = node.not;
        const decide = (v, list) => { if (v == null) return null; let sawNull = false; for (const x of list) { if (x == null) { sawNull = true; continue; } if (compare(v, x) === 0) return !not; } return sawNull ? null : not; };
        if (node.list) { const list = node.list.map(c); return env => decide(e(env), list.map(f => f(env))); }
        const sub = planSub(node.q, scope, ctx);
        if (sub.cols.filter(x => !x.hidden).length !== 1) throw new SqlError('DATATYPE_MISMATCH.INVALID_IN_SUBQUERY', `The number of columns in the IN subquery (${sub.cols.length}) does not match the left side (1).`);
        let cache = null;
        return env => { const vals = sub.correlated || !cache ? sub.run(env).map(r => r[0]) : cache; if (!sub.correlated) cache = vals; return decide(e(env), vals); };
      }
      case 'exists': { const sub = planSub(node.q, scope, ctx); let cache = null; return env => { if (!sub.correlated && cache != null) return cache; const r = sub.run(env).length > 0; if (!sub.correlated) cache = r; return r; }; }
      case 'subq': {
        const sub = planSub(node.q, scope, ctx);
        if (sub.cols.filter(x => !x.hidden).length !== 1) throw new SqlError('INVALID_SUBQUERY_EXPRESSION.SCALAR_SUBQUERY_RETURN_MORE_THAN_ONE_OUTPUT_COLUMN', `A scalar subquery must return exactly one column, but this one returns ${sub.cols.length}.`);
        let cache, cached = false;
        return env => {
          if (!sub.correlated && cached) return cache;
          const rows = sub.run(env);
          if (rows.length > 1) throw new SqlError('SCALAR_SUBQUERY_TOO_MANY_ROWS', 'More than one row returned by a subquery used as an expression. Aggregate the subquery, or add a filter so it returns at most one row.');
          const v = rows.length ? rows[0][0] : null;
          if (!sub.correlated) { cache = v; cached = true; }
          return v;
        };
      }
      case 'case': {
        const base = node.base ? c(node.base) : null;
        const whens = node.whens.map(([w, t]) => [c(w), c(t)]);
        const els = node.else ? c(node.else) : () => null;
        return env => {
          if (base) { const b = base(env); for (const [w, t] of whens) { const v = w(env); if (b != null && v != null && compare(b, v) === 0) return t(env); } return els(env); }
          for (const [w, t] of whens) if (truthy(w(env))) return t(env);
          return els(env);
        };
      }
      case 'cast': { const e = c(node.e), t = node.type, tr = !!node.try; return env => castValue(e(env), t, tr); }
      case 'interval': {
        const v = typeof node.v === 'number' ? () => node.v : c(node.v);
        const unit = node.unit;
        return env => { const n = X.num(v(env)); switch (unit) { case 'YEAR': return new Interval(12 * n, 0, 0); case 'MONTH': return new Interval(n, 0, 0); case 'WEEK': return new Interval(0, 7 * n, 0); case 'DAY': return new Interval(0, n, 0); case 'HOUR': return new Interval(0, 0, n * 3600000); case 'MINUTE': return new Interval(0, 0, n * 60000); case 'SECOND': return new Interval(0, 0, n * 1000); default: throw new SqlError('INVALID_INTERVAL_FORMAT', `Unknown interval unit ${unit}.`); } };
      }
      case 'fn': return compileFn(node, scope, ctx, opts);
      case 'lambda': throw new SqlError('INVALID_LAMBDA_FUNCTION_CALL', 'A lambda function can only be used as an argument to a higher-order function such as transform, filter or aggregate.');
      case 'star': throw new SqlError('INVALID_USAGE_OF_STAR_OR_REGEX', 'Invalid usage of `*` in an expression. Use `*` only in the SELECT list or in count(*).');
      default: throw new SqlError('INTERNAL_ERROR', 'Cannot compile ' + node.k);
    }
  }
  function fieldPath(v, rest) {
    for (const name of rest) {
      if (v == null) return null;
      if (Array.isArray(v)) { v = v.map(x => (x == null ? null : fieldPath(x, [name]))); continue; }
      if (v instanceof Map) { let hit = null; v.forEach((x, k) => { if (lc(k) === lc(name)) hit = x; }); v = hit; continue; }
      if (!X.isStruct(v)) throw new SqlError('INVALID_EXTRACT_BASE_FIELD_TYPE', `Can't extract a value from ${typeOf(v)}. Need a complex type [STRUCT, ARRAY, MAP] but got ${typeOf(v)}.`);
      const key = Object.keys(v).find(k => lc(k) === lc(name));
      if (key === undefined) throw new SqlError('FIELD_NOT_FOUND', `No such struct field ${bt(name)} in ${Object.keys(v).map(bt).join(', ')}.`);
      v = v[key];
    }
    return v;
  }
  function planSub(q, scope, ctx) {
    const p = planQuery(q, ctx, scope);
    return p;
  }
  function compileBin(node, c) {
    const op = node.op;
    const l = c(node.l), r = c(node.r);
    switch (op) {
      case 'AND': return env => { const a = l(env); if (a === false) return false; const b = r(env); if (b === false) return false; return a == null || b == null ? null : true; };
      case 'OR': return env => { const a = l(env); if (a === true) return true; const b = r(env); if (b === true) return true; return a == null || b == null ? null : false; };
      case '=': return env => { const a = l(env), b = r(env); return a == null || b == null ? null : compare(a, b) === 0; };
      case '<>': return env => { const a = l(env), b = r(env); return a == null || b == null ? null : compare(a, b) !== 0; };
      case '<': return env => { const a = l(env), b = r(env); return a == null || b == null ? null : compare(a, b) < 0; };
      case '>': return env => { const a = l(env), b = r(env); return a == null || b == null ? null : compare(a, b) > 0; };
      case '<=': return env => { const a = l(env), b = r(env); return a == null || b == null ? null : compare(a, b) <= 0; };
      case '>=': return env => { const a = l(env), b = r(env); return a == null || b == null ? null : compare(a, b) >= 0; };
      case '<=>': return env => { const a = l(env), b = r(env); return (a == null && b == null) || (a != null && b != null && compare(a, b) === 0); };
      case '||': return env => { const a = l(env), b = r(env); if (a == null || b == null) return null; if (Array.isArray(a) && Array.isArray(b)) return a.concat(b); return X.toStr(a) + X.toStr(b); };
      case '&': return env => { const a = l(env), b = r(env); return a == null || b == null ? null : a & b; };
      case '|': return env => { const a = l(env), b = r(env); return a == null || b == null ? null : a | b; };
      case '^': return env => { const a = l(env), b = r(env); return a == null || b == null ? null : a ^ b; };
      default: return env => arith(op, l(env), r(env));
    }
  }
  function compileFn(node, scope, ctx, opts) {
    const name = node.name;
    if (node.over) throw new SqlError('UNSUPPORTED_EXPR_FOR_WINDOW', `Window function ${bt(name)} is not allowed here. Window functions are allowed in SELECT, QUALIFY and ORDER BY.`);
    if (isAggCall(node) || name === 'count') {
      if (scope.group) throw new SqlError('MISSING_AGGREGATION', `Aggregate ${bt(exprName(node))} could not be matched to the grouping.`);
      throw new SqlError('MISSING_GROUP_BY', `Aggregate function ${bt(exprName(node))} is not allowed here. Use it in SELECT, HAVING or ORDER BY of an aggregating query, or inside a subquery.`);
    }
    if (WINDOW_ONLY.has(name)) throw new SqlError('WINDOW_FUNCTION_WITHOUT_OVER_CLAUSE', `${bt(name)} is a window function and requires an OVER clause, for example ${name}() OVER (PARTITION BY … ORDER BY …).`);
    if (GENERATORS.has(name)) throw new SqlError('UNSUPPORTED_GENERATOR.NOT_GENERATOR', `The generator ${bt(name)} is not supported in this position. Use it as a top-level item in SELECT, in LATERAL VIEW, or in FROM.`);
    if (name === 'grouping' || name === 'grouping_id') {
      if (!scope.group) throw new SqlError('UNSUPPORTED_GROUPING_EXPRESSION', 'grouping()/grouping_id() can only be used with GROUP BY ROLLUP, CUBE or GROUPING SETS.');
      const gidIndex = scope.cols.findIndex(col => col.name === '__grouping_id');
      if (name === 'grouping_id') return env => env.row[gidIndex];
      const fp = fingerprint(node.args[0], scope.group.S0);
      const ki = scope.group.keyFps.indexOf(fp);
      if (ki < 0) throw new SqlError('GROUPING_COLUMN_MISMATCH', 'The column of grouping() must be one of the grouping columns.');
      const bit = scope.group.nk - 1 - ki;
      return env => (env.row[gidIndex] >> bit) & 1;
    }
    if (HIGHER_ORDER[name] && node.args.some(a => a.k === 'lambda')) {
      const args = node.args.map(a => {
        if (a.k !== 'lambda') return { f: compile(a, scope, ctx, opts) };
        const body = compile(a.body, scope, ctx, Object.assign({}, opts, { lambda: (opts.lambda || []).concat([]).length ? a.params.concat(opts.lambda) : a.params }));
        return { lambda: body, n: a.params.length, outerLambda: opts.lambda ? opts.lambda.length : 0 };
      });
      const impl = HIGHER_ORDER[name];
      return env => impl(...args.map(a => (a.f ? a.f(env) : (...vals) => a.lambda(Object.assign({}, env, { lambda: vals.slice(0, a.n).concat(env.lambda || []) }))))) ;
    }
    if (UNIT_FNS.has(name) && node.args.length === 3 && node.args[0].k === 'col' && node.args[0].parts.length === 1) node = Object.assign({}, node, { args: [{ k: 'lit', v: node.args[0].parts[0].toUpperCase() }].concat(node.args.slice(1)) });
    if (name === 'from_json') {
      if (node.args.length < 2 || node.args[1].k !== 'lit' || typeof node.args[1].v !== 'string') throw new SqlError('INVALID_SCHEMA.NON_STRING_LITERAL', 'from_json needs a schema as a string literal, for example from_json(payload, \'STRUCT<id: INT, tags: ARRAY<STRING>>\').');
      let type;
      try { type = X.parseType(node.args[1].v); } catch (e) { throw new SqlError('INVALID_SCHEMA.PARSE_ERROR', `The schema ${node.args[1].v} is invalid: ${e.message}`); }
      const js = compile(node.args[0], scope, ctx, opts);
      const conv = (v, t) => {
        if (v == null) return null;
        if (t.base === 'STRUCT') { if (typeof v !== 'object' || Array.isArray(v)) return null; const o = {}; t.fields.forEach(f => { const k = Object.keys(v).find(x => lc(x) === lc(f.name)); o[f.name] = k === undefined ? null : conv(v[k], f.type); }); return o; }
        if (t.base === 'ARRAY') return Array.isArray(v) ? v.map(x => conv(x, t.el)) : null;
        if (t.base === 'MAP') { if (typeof v !== 'object' || Array.isArray(v)) return null; const m = new Map(); Object.keys(v).forEach(k => m.set(k, conv(v[k], t.vt))); return m; }
        if (typeof v === 'object') return t.base === 'STRING' ? JSON.stringify(v) : null;
        return castValue(t.base === 'STRING' ? String(v) : v, t, true);
      };
      return env => { const s = js(env); if (s == null) return null; let v; try { v = JSON.parse(s); } catch (e) { return null; } return conv(v, type); };
    }
    if (name === 'struct') {
      const names = node.args.map((a, i) => (a.k === 'col' ? a.parts[a.parts.length - 1] : a.k === 'field' ? a.name : `col${i + 1}`));
      const fns = node.args.map(a => compile(a, scope, ctx, opts));
      return env => { const o = {}; fns.forEach((f, i) => { o[names[i]] = f(env); }); return o; };
    }
    const impl = SCALAR[name];
    if (!impl) {
      const known = Object.keys(SCALAR).concat(Object.keys(AGG), Array.from(WINDOW_ONLY), Object.keys(HIGHER_ORDER));
      throw new SqlError('UNRESOLVED_ROUTINE', `Cannot resolve routine ${bt(name)} on search path [\`system\`.\`builtin\`, \`system\`.\`session\`]. Did you mean ${suggest(name, known).slice(0, 3).map(bt).join(', ')}?`);
    }
    if (node.star) throw new SqlError('INVALID_USAGE_OF_STAR_OR_REGEX', `Invalid usage of '*' in ${name}.`);
    if (node.distinct) throw new SqlError('INVALID_DISTINCT', `DISTINCT is only valid in aggregate functions, not in ${name}.`);
    const args = node.args.map(a => compile(a, scope, ctx, opts));
    const n = args.length;
    if (n === 0) return () => impl();
    if (n === 1) { const a0 = args[0]; return env => impl(a0(env)); }
    if (n === 2) { const [a0, a1] = args; return env => impl(a0(env), a1(env)); }
    return env => impl(...args.map(f => f(env)));
  }

  /* ---------- display ---------- */
  function display(v) {
    if (v == null) return 'NULL';
    if (typeof v === 'number') return X.fmtNum(v);
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v) || v instanceof Map || X.isStruct(v)) return JSON.stringify(jsonish(v));
    return String(v);
  }
  function jsonish(v) {
    if (v == null) return null;
    if (Array.isArray(v)) return v.map(jsonish);
    if (v instanceof Map) { const o = {}; v.forEach((x, k) => { o[X.toStr(k)] = jsonish(x); }); return o; }
    if (X.isStruct(v)) { const o = {}; Object.keys(v).forEach(k => { o[k] = jsonish(v[k]); }); return o; }
    if (typeof v === 'number') return Number(X.fmtNum(v));
    return v instanceof X.SqlDate || v instanceof X.SqlTs ? String(v) : v;
  }

  Object.assign(X, { Database, display, planQuery, exprName });
})(typeof window !== 'undefined' ? window : global);
