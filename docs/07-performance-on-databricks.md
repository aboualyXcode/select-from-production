# 7. Performance on Databricks

The playground's dataset fits in a browser, so it teaches correctness, not speed. On real tables with billions of rows, the same SQL can take seconds or hours depending on a few habits. This chapter collects them.

## Read less data

Delta tables are columnar files with statistics. The cheapest data is the data you never read.

- **Select the columns you need.** `SELECT *` on a wide table reads every column; listing three columns reads three.
- **Filter on columns directly.** `WHERE order_ts >= '2026-01-01'` lets Delta skip files whose min/max statistics exclude the range. Wrapping the column, as in `WHERE year(order_ts) = 2026` or `WHERE CAST(order_ts AS STRING) LIKE '2026%'`, can prevent skipping. Rewrite as a range.
- **Cluster by what you filter on.** Liquid clustering (`CLUSTER BY (event_id, order_ts)`, or `CLUSTER BY AUTO`) colocates related rows so skipping works. It replaces partitioning and Z-ordering for most tables, and clustering keys can be changed later.
- **Let maintenance run.** Predictive optimization runs `OPTIMIZE` (compaction and clustering) and `VACUUM` on Unity Catalog managed tables. Without it, schedule them.

## Join well

- **Small dimension tables are broadcast** to every worker automatically, which avoids shuffling the large side. If the planner misjudges sizes, a hint helps: `SELECT /*+ BROADCAST(v) */ …`.
- **Filter before joining**, especially before joining two large tables.
- **Watch for fan-out** ([chapter 2](02-joins.md#fan-out)): a join that multiplies rows multiplies work too.
- **Skew:** one key with millions of rows (a default customer ID, NULLs) overloads one task. Adaptive query execution splits skewed partitions automatically; filtering out junk keys before the join helps more.

## Aggregate and window wisely

- `COUNT(DISTINCT x)` over billions of rows is expensive; `approx_count_distinct(x)` is usually within a few percent and far cheaper. The same goes for `percentile_approx` versus exact percentiles.
- A window function without `PARTITION BY` puts every row in a single partition on a single task. Partition by something when you can.
- `ORDER BY` without `LIMIT` sorts everything. Sort only the final result.
- Aggregate before joining when the join only needs the aggregate.

## Prefer built-ins

- Built-in functions run in **Photon**, the vectorized engine that SQL warehouses use by default. Python UDFs leave it and serialize data row by row. Almost every string, date, JSON and array task has a built-in, and higher-order functions (`transform`, `filter`, `aggregate`) replace most array UDFs.
- `try_cast`, `regexp_extract` and `from_json` are all native.

## Reuse results

- **Materialized views** precompute expensive aggregations and refresh incrementally where possible.
- **Gold tables** built by a pipeline beat recomputing the same joins in every dashboard query.
- SQL warehouses cache query results and remote file data. Repeated dashboard queries are often served from cache; benchmarks should account for that.

## Diagnose before tuning

1. Open the **query profile** for a slow query: it shows time, rows and bytes per operator, so you can see which scan or join dominates.
2. Check **files and bytes read** against what the filter should have needed. Many files read for a narrow filter means skipping isn't working: check clustering and the filter's shape.
3. `EXPLAIN FORMATTED <query>` shows the plan: join strategies, pushed filters, partition and file pruning.
4. Change one thing at a time, and measure on realistic data volumes.

## A checklist for production queries

- [ ] Only the columns needed, filters directly on columns.
- [ ] Large tables clustered by their common filters and join keys.
- [ ] No fan-out: row counts checked at each join.
- [ ] Aggregations at the right grain, approximate where exactness isn't needed.
- [ ] No Python UDFs where a built-in exists.
- [ ] Expensive repeated logic materialized once.
- [ ] Checked in the query profile on production-sized data.
