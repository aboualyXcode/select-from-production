# 3. Aggregation and window functions

Aggregation **collapses** rows into groups. Window functions **keep** every row and add a value computed over related rows. Most analytical SQL is one or both.

## Grain first

Before aggregating, state the grain of the rows you are aggregating. After joining `orders` to `order_items`, each row is an order *line*, so `COUNT(*)` counts lines, not orders. Use `COUNT(DISTINCT o.order_id)`, or aggregate lines to one row per order first.

Ratios and distinct counts cannot be added across groups. Monthly distinct customers do not sum to yearly distinct customers, and an average of per-customer averages is not the average order value ([incident: avg-of-avgs](https://aboualyxcode.github.io/select-from-production/#avg-of-avgs)). Compute ratios as total ÷ count at the grain the business means.

## Conditional aggregation

One pass, one row per group, one column per condition:

```sql
SELECT channel,
       COUNT(*)                                     AS orders,
       COUNT(*) FILTER (WHERE status = 'PAID')      AS paid,
       count_if(status = 'REFUNDED')                AS refunded,
       AVG(IF(status = 'PAID', 1, 0))               AS paid_rate
FROM orders
GROUP BY ALL;
```

`FILTER (WHERE …)` works on any aggregate, including `COUNT(DISTINCT …)`, `SUM` and `AVG`.

## Useful aggregates

| Function | Returns |
|---|---|
| `count_if(cond)` | Rows where cond is true |
| `max_by(x, y)` / `min_by(x, y)` | The x from the row with the largest / smallest y |
| `collect_list(x)` / `collect_set(x)` | An array of values (order not guaranteed: sort it) |
| `median(x)`, `percentile(x, p)` | Exact, interpolated |
| `percentile_approx(x, p)` | Approximate, cheap on big data, returns a real value |
| `any_value(x)` | Any value from the group, when you know they're all the same |
| `string_agg(x, sep) WITHIN GROUP (ORDER BY …)` | Concatenated text |

`GROUP BY ROLLUP (a, b)` adds subtotals for each `a` and a grand total; `CUBE` adds every combination; `GROUPING SETS` lists them explicitly. Use `grouping(col)` to tell a subtotal row from a real NULL.

## Window functions

```sql
function(args) OVER (PARTITION BY … ORDER BY … frame)
```

- **PARTITION BY** splits rows into independent groups (like GROUP BY, without collapsing).
- **ORDER BY** orders rows within each partition.
- **The frame** chooses which rows around the current one an aggregate sees.

| Need | Function |
|---|---|
| Number rows | `ROW_NUMBER()` (unique), `RANK()` (gaps after ties), `DENSE_RANK()` (no gaps) |
| Previous / next row | `LAG(x, n, default)`, `LEAD(x, n, default)` |
| Running total | `SUM(x) OVER (ORDER BY ts)` |
| Moving average | `AVG(x) OVER (ORDER BY ts ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` |
| Share of total | `x / SUM(x) OVER ()` |
| Buckets | `NTILE(4) OVER (ORDER BY spend DESC)` |
| First / last in a frame | `FIRST_VALUE(x)`, `LAST_VALUE(x)`, `NTH_VALUE(x, n)` |

### Frames: the detail that bites

With `ORDER BY` and no explicit frame, an aggregate window defaults to `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. `RANGE` includes **ties**: two rows with the same timestamp get the same running total. Use `ROWS` when you mean physical rows.

`LAST_VALUE(x) OVER (ORDER BY ts)` returns the current row's value, because the default frame ends at the current row. For the true last value, use `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.

"The last 3 rows" is not "the last 3 days" when days are missing. Zero-fill the calendar first ([time series](04-data-quality-and-time.md)).

### Top-N and deduplication with QUALIFY

```sql
-- latest order per customer
SELECT *
FROM orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_ts DESC, order_id DESC) = 1;
```

This is the most common pattern in production SQL: latest record per key, deduplicating a source before a MERGE, top N per group. Always add a **tie-breaker** to the ORDER BY. Without one, "the latest" can change between runs when two rows share a timestamp.

### Windows over aggregates

Window functions run after GROUP BY, so they can wrap aggregates:

```sql
SELECT genre, SUM(qty) AS tickets,
       SUM(qty) / SUM(SUM(qty)) OVER () AS share,
       RANK() OVER (ORDER BY SUM(qty) DESC) AS rnk
FROM …
GROUP BY genre;
```

**Practise:** the Aggregation and Window functions tracks.
