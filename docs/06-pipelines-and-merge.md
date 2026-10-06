# 6. Pipelines and MERGE

Queries that read data can be rerun freely. Statements that change data cannot, so the questions change: what happens if this runs twice, if the input has duplicates, or if a batch arrives late?

## MERGE: the upsert

```sql
MERGE INTO event_prices t
USING price_updates s
ON t.event_id = s.event_id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
WHEN NOT MATCHED BY SOURCE THEN DELETE;   -- optional: remove rows missing from a full snapshot
```

- Every clause can take a condition: `WHEN MATCHED AND s.updated_at > t.updated_at THEN …`.
- `UPDATE SET *` and `INSERT *` map columns by name; the source must have every target column.
- MERGE is one Delta transaction: readers see the table before or after, never halfway.
- The result reports `num_updated_rows`, `num_inserted_rows` and `num_deleted_rows`. Check them in jobs.

## The three MERGE rules

**1. One source row per key.** If two source rows match the same target row, Delta refuses with `DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE` rather than guess. Deduplicate the source first:

```sql
USING (SELECT * FROM feed QUALIFY ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY updated_at DESC) = 1) s
```

**2. Never let older data win.** Replays and late batches carry older versions. Guard updates with a sequence column:

```sql
WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET *
```

**3. Be idempotent.** A job that is retried after a timeout must not double anything. MERGE on a key is naturally idempotent; a plain `INSERT` is not.

Practise all three: [The MERGE that fails](https://aboualyxcode.github.io/select-from-production/#merge-dedupe-source).

## SCD Type 2

To keep history, a change closes the current version and inserts a new one:

```sql
-- 1. close changed current rows
MERGE INTO dim_customer_city d
USING city_changes s
ON d.customer_id = s.customer_id AND d.is_current
WHEN MATCHED AND d.city <> s.city THEN UPDATE SET valid_to = s.changed_on, is_current = false;

-- 2. add a current row for every change without one
INSERT INTO dim_customer_city
SELECT s.customer_id, s.city, s.changed_on, NULL, true
FROM city_changes s
LEFT ANTI JOIN dim_customer_city d ON d.customer_id = s.customer_id AND d.is_current;
```

The single-statement version unions the changes twice, once with the key (to close) and once with a NULL merge key (which never matches, so it inserts). See the alternative solution in [SCD Type 2](https://aboualyxcode.github.io/select-from-production/#scd2-merge).

Both versions assume changes arrive in order. In Lakeflow declarative pipelines, `AUTO CDC … STORED AS SCD TYPE 2` handles ordering, late data and deletes for you. Prefer it for new pipelines.

## Incremental loads

| Strategy | How | Weakness |
|---|---|---|
| High-water mark | `WHERE day > (SELECT MAX(day) FROM target)` | Misses data that arrives after its period was loaded |
| Reprocess a window | MERGE the last N days every run | More work per run, but late data within N days is fixed |
| Change data feed | Read only changed rows from a Delta source | Needs CDF enabled on the source |
| Streaming tables | The pipeline tracks what was processed | Requires a declarative pipeline or Structured Streaming |

Whatever the strategy: the load must be idempotent, and there must be a way to backfill.

## Rebuilds and recovery

- `CREATE OR REPLACE TABLE … AS SELECT` rebuilds atomically: readers see the old table until the new one commits, and the table history keeps both.
- `DESCRIBE HISTORY t` lists every write. `SELECT … FROM t VERSION AS OF 12` and `RESTORE TABLE t TO VERSION AS OF 12` recover from a bad write, within the retention period.
- `DELETE` and `UPDATE` with precise predicates (by key) are safer than broad ones. Test the predicate as a `SELECT` first.

**Practise:** the Pipelines and MERGE track. These challenges check the resulting table, and those marked idempotent are graded twice.
