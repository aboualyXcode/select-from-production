# 4. Data quality and time series

## Data quality: write the checks as queries

Bad data rarely announces itself. These queries find it before a dashboard does.

| Check | Pattern |
|---|---|
| Duplicate keys | `SELECT key, COUNT(*) FROM t GROUP BY key HAVING COUNT(*) > 1` |
| Orphans (broken references) | `child LEFT ANTI JOIN parent ON …` |
| Cross-row rules | Self join, for example a referrer who signed up after the customer they referred |
| Unparseable values | `count_if(try_cast(x AS DATE) IS NULL AND x IS NOT NULL)` |
| Out-of-range values | `count_if(qty <= 0)` |
| Completeness | Compare row counts or totals between layers |

Delta Lake primary and foreign keys are **informational**: they document the model and help the optimizer, but they are not enforced. `NOT NULL` and `CHECK` constraints are enforced. Everything else needs a test.

### Deduplication patterns

```sql
-- keep the latest row per key
QUALIFY ROW_NUMBER() OVER (PARTITION BY key ORDER BY updated_at DESC, id DESC) = 1

-- find exact duplicates of a whole row
SELECT *, COUNT(*) AS copies FROM t GROUP BY ALL HAVING COUNT(*) > 1

-- remove all but the first, by key
DELETE FROM t WHERE id IN (SELECT id FROM t QUALIFY ROW_NUMBER() OVER (PARTITION BY key ORDER BY ts, id) > 1)
```

Standardize **before** deduplicating: `' A@X.COM '` and `'a@x.com'` are the same customer only after `lower(trim(…))`.

### Cleaning strings

| Problem | Function |
|---|---|
| Stray spaces | `trim`, `regexp_replace(s, ' +', ' ')` |
| Mixed case | `lower`, `upper`, `initcap` |
| Validation | `s RLIKE '^[^@ ]+@[^@ ]+[.][a-z]+$'` |
| Extraction | `regexp_extract(s, pattern, group)`, `split_part(s, delim, n)` |
| Several date formats | `coalesce(try_cast(s AS DATE), CAST(try_to_timestamp(s, 'dd/MM/yyyy') AS DATE))` |

Regular expressions are Java-style. In SQL string literals, a backslash escapes the next character, so `\d` must be written `'\\d'`; character classes such as `[0-9]` avoid the problem.

### NULL-safe change detection

`a <> b` misses every change to or from NULL. Use `a IS DISTINCT FROM b` (or `NOT (a <=> b)`). When comparing with `LAG`, remember it returns NULL both for "previous value was NULL" and for "there is no previous row" ([promo changes](https://aboualyxcode.github.io/select-from-production/#promo-changes)).

## Time series

### Zero-fill with a calendar

Aggregates only produce rows for values that exist, so a day with no sales simply vanishes, and `LAG` then compares with the wrong period. Generate the calendar and LEFT JOIN to it:

```sql
WITH days AS (SELECT explode(sequence(DATE'2026-01-01', DATE'2026-01-31')) AS day)
SELECT d.day, COUNT(o.order_id) AS orders
FROM days d
LEFT JOIN orders o ON CAST(o.order_ts AS DATE) = d.day
GROUP BY d.day;
```

In a warehouse, keep a permanent `dim_date` table instead.

### Gaps and islands

Consecutive values minus their row number are constant within a run:

```sql
date_sub(snapshot_date, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY snapshot_date)) AS grp
```

Group by `grp` to get each run's start, end and length. For any other definition of "a new group starts here", flag the boundary and take a running sum:

```sql
SUM(IF(<boundary condition>, 1, 0)) OVER (PARTITION BY key ORDER BY ts ROWS UNBOUNDED PRECEDING)
```

### Sessionization

A session is a gaps-and-islands problem with a time threshold: a new session starts when the previous event (same user, same device) is missing or more than 30 minutes earlier.

```sql
CASE WHEN LAG(ts) OVER w IS NULL OR ts - LAG(ts) OVER w > INTERVAL 30 MINUTES THEN 1 ELSE 0 END
```

Count sessions by summing the flags.

### Dates and timestamps on Databricks

| Need | Function |
|---|---|
| Truncate | `date_trunc('MONTH', ts)` → timestamp; `trunc(date, 'MM')` → date |
| Format | `date_format(ts, 'yyyy-MM')`; patterns are case-sensitive (`MM` month, `mm` minutes) |
| Difference | `datediff(end, start)` in days; `timestampdiff(HOUR, start, end)` |
| Add | `date_add(d, 7)`, `add_months(d, 1)`, `ts + INTERVAL 2 HOURS` |
| Parts | `year`, `month`, `dayofweek` (Sunday = 1), `weekday` (Monday = 0), `extract(HOUR FROM ts)` |
| Generate | `sequence(start, stop, INTERVAL 1 DAY)` |

Store timestamps in UTC and convert for display. Group by a numeric key (month number, `weekday`) and display the label, or alphabetical order will put Friday before Monday.

### Cohorts

Reduce to **one row per entity** first (did this customer convert within 30 days? 1 or 0), then aggregate per cohort. Joining every qualifying order and counting double counts, and an inner join loses the customers who never converted, who are the denominator.

**Practise:** the Data quality and Dates and time series tracks.
