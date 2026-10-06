# 8. About the engine

The playground runs your SQL on a Databricks-compatible engine written in JavaScript (`js/sql/`), so it works in any browser, offline, with no account. This chapter is honest about what that means.

## What it supports

| Area | Supported |
|---|---|
| Queries | SELECT, DISTINCT, WHERE, GROUP BY (incl. `ALL`, ordinals, aliases), HAVING, QUALIFY, ORDER BY with `NULLS FIRST/LAST`, LIMIT/OFFSET, `SELECT * EXCEPT (…)`, lateral column aliases |
| Joins | INNER, LEFT, RIGHT, FULL, CROSS, `LEFT SEMI`, `LEFT ANTI`, `USING`, `NATURAL`, `LATERAL` subqueries, range and non-equi joins |
| Subqueries | Scalar, `IN`, `EXISTS`, correlated, derived tables |
| CTEs | `WITH`, multiple CTEs, `WITH RECURSIVE` |
| Set operations | `UNION [ALL]`, `INTERSECT [ALL]`, `EXCEPT [ALL]` |
| Aggregation | ~30 aggregates incl. `count_if`, `max_by`, `collect_list/set`, percentiles, `string_agg … WITHIN GROUP`, `FILTER (WHERE …)`, `ROLLUP`, `CUBE`, `GROUPING SETS`, `grouping()` |
| Windows | Ranking, `LAG`/`LEAD`, `FIRST/LAST/NTH_VALUE`, `NTILE`, `PERCENT_RANK`, `CUME_DIST`, any aggregate over `ROWS`/`RANGE` frames, named `WINDOW` clauses |
| Types | INT/BIGINT, DOUBLE, DECIMAL(p,s), STRING, BOOLEAN, DATE, TIMESTAMP, INTERVAL, ARRAY, STRUCT, MAP |
| Functions | ~150: strings, regex, dates and timestamps (Java patterns), math, conditionals, arrays, maps, structs, JSON (`:` paths, `get_json_object`, `from_json`, `to_json`), higher-order functions with lambdas, generators (`explode`, `posexplode`, `inline`, `_outer`, `LATERAL VIEW`, `range`) |
| DML and DDL | INSERT (VALUES, SELECT, OVERWRITE, column lists), UPDATE, DELETE, MERGE (all clause types incl. `NOT MATCHED BY SOURCE`, `SET *`, `INSERT *`), CREATE [OR REPLACE] TABLE [AS SELECT], temporary and permanent views, DROP, TRUNCATE, DESCRIBE, SHOW TABLES |
| Semantics | ANSI mode as on SQL warehouses: `DIVIDE_BY_ZERO`, `CAST_INVALID_INPUT` and friends, `try_*` variants, Spark-style rounding, Databricks error classes with suggestions |

## What it does not do

- **Performance features**: no files, statistics, clustering, Photon, caching or query profile. Chapter 7 covers them in prose.
- **Delta and Unity Catalog features**: no table history, time travel, `DESCRIBE HISTORY`, constraints beyond NOT NULL, catalogs, permissions or tags. `USE`, `CREATE SCHEMA`, `CLUSTER BY`, `COMMENT` and `TBLPROPERTIES` are accepted and ignored so real scripts run.
- **Some syntax**: `PIVOT`/`UNPIVOT`, the `VARIANT` type, `schema_of_json`, SQL UDFs, named parameters, `IDENTIFIER()`, and streaming are not implemented.
- **Floating point**: numbers are JavaScript doubles. `DECIMAL(p,s)` values are rounded to their scale on cast, which covers the challenges, but arbitrary-precision decimal arithmetic is not emulated.
- **Non-deterministic order**: like Databricks, rows without ORDER BY have no guaranteed order. The grader compares unordered results as multisets unless a challenge asks for an order.

If something you'd expect to work fails with `UNSUPPORTED_FEATURE` or `UNRESOLVED_ROUTINE`, it's probably in this list. The `databricks/` folder has every challenge as a `.sql` file for a real warehouse.

## How it is verified

- **Differential testing against SQLite** (`tests/differential_sqlite.py`): 101 queries covering joins, grouping, window frames, correlated subqueries, set operations, recursive CTEs, NULL logic and DML run on both engines over the same data, and must return identical results. Where the dialects spell things differently, each side gets its own spelling.
- **Databricks-specific tests** (`tests/engine.test.js`): 104 checks of behaviour SQLite can't confirm, mostly taken from the examples in the Databricks SQL reference: date patterns, `months_between`, `add_months`, `split`, regex groups, array and map functions, generators, `QUALIFY`, `GROUP BY ALL`, MERGE semantics and error classes.
- **Challenge soundness** (`tests/challenges.test.js`): every challenge has an independent alternative solution that must produce the same result, and known wrong answers ("traps") that must be rejected. Idempotent challenges are graded twice.
- **Export fidelity** (`tests/databricks-export.test.js`): the generated Databricks dataset script must reproduce every table exactly, and every generated solution file must run cleanly and match.

During development these tests caught real issues: the alternative solutions disagreed with a reference over a denominator, and the engine initially lacked interval comparison, struct construction and two Databricks syntax forms. If you find a query that behaves differently from Databricks, please open an issue with the query and both results.
