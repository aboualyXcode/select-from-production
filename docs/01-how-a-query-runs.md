# 1. How a query runs

Most confusing SQL errors make sense once you know the order in which a query is evaluated. It is not the order in which it is written.

## Logical evaluation order

```
FROM / JOIN      build the rows
WHERE            keep rows where the condition is true
GROUP BY         form groups
HAVING           keep groups
WINDOW           compute window functions (OVER …)
QUALIFY          keep rows by window results          ← Databricks
SELECT           compute output columns
DISTINCT         remove duplicate output rows
ORDER BY         sort
LIMIT / OFFSET   cut
```

This explains several rules at once:

- **WHERE cannot use aggregates or window functions**: they don't exist yet when WHERE runs. Filter aggregates in `HAVING` and window results in `QUALIFY`. Using one in WHERE raises `INVALID_WHERE_CONDITION` or `UNSUPPORTED_EXPR_FOR_WINDOW`.
- **Window functions see the rows left after WHERE and GROUP BY.** Filtering customers before computing `LAG` changes the gaps it computes ([days between orders](https://aboualyxcode.github.io/select-from-production/#days-between-orders)).
- **Every SELECT column in a grouped query must be grouped or aggregated**, otherwise Databricks raises `MISSING_AGGREGATION`. `GROUP BY ALL` groups by every non-aggregate SELECT expression, so the two can't drift apart.

The optimizer is free to execute in any physical order that gives the same result. The logical order is about meaning, not performance.

## Databricks conveniences worth using

| Feature | Example | Why |
|---|---|---|
| `GROUP BY ALL` | `SELECT country, genre, SUM(x) … GROUP BY ALL` | No duplicated column lists |
| `QUALIFY` | `QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts DESC) = 1` | Filter on windows without a subquery |
| Lateral column aliases | `SELECT price * qty AS total, total * 0.19 AS vat` | Reuse an alias later in the same SELECT |
| Aliases in HAVING and QUALIFY | `HAVING total > 100` | Shorter, clearer filters |
| `SELECT * EXCEPT (col)` | `SELECT * EXCEPT (raw_payload) FROM t` | Drop a few columns from a wide table |
| `LEFT SEMI` / `LEFT ANTI JOIN` | `customers LEFT ANTI JOIN orders USING (customer_id)` | "Has a match" / "has no match" without duplicates |
| `count_if`, `max_by`, `min_by` | `max_by(channel, order_ts)` | Common aggregates without CASE or self joins |
| `FILTER (WHERE …)` | `COUNT(*) FILTER (WHERE status = 'PAID')` | Conditional aggregates in one pass |

## NULL is not a value, it is "unknown"

SQL uses three-valued logic: a comparison involving NULL is neither true nor false but **unknown**, and WHERE keeps only rows where the condition is true.

| Expression | Result |
|---|---|
| `NULL = NULL` | NULL |
| `NULL <> 'x'` | NULL |
| `email = NULL` | always NULL: use `email IS NULL` |
| `a <=> b` / `a IS NOT DISTINCT FROM b` | true when both are NULL |
| `NULL AND false` | false |
| `NULL OR true` | true |
| `x NOT IN (1, 2, NULL)` | never true |

The last row is responsible for one of the most common silent bugs in SQL ([incident: not-in-null](https://aboualyxcode.github.io/select-from-production/#not-in-null)). Prefer `NOT EXISTS` or `LEFT ANTI JOIN`.

Aggregates skip NULLs: `COUNT(col)` counts non-NULL values, `AVG(col)` averages them, and `COUNT(*)` counts rows. That difference matters after a LEFT JOIN.

## ANSI mode

Databricks SQL warehouses run with **ANSI mode on**. Errors that some engines hide become loud:

| Operation | ANSI mode | Tolerant alternative |
|---|---|---|
| `1 / 0` | `DIVIDE_BY_ZERO` error | `try_divide(a, b)`, or `a / NULLIF(b, 0)` |
| `CAST('abc' AS INT)` | `CAST_INVALID_INPUT` error | `try_cast('abc' AS INT)` → NULL |
| `array(1, 2)[5]` | `INVALID_ARRAY_INDEX` error | `get(arr, 5)` or `try_element_at` |
| `to_date('31/12', 'dd/MM/yyyy')` | `CANNOT_PARSE_TIMESTAMP` | `try_to_timestamp` |

Loud is good in production: a silent NULL can travel all the way to a dashboard. Use the `try_` functions deliberately, where bad input is expected, and count the NULLs they produce.

Division always returns a decimal or double on Databricks (`7 / 2 = 3.5`). Use `DIV` for integer division (`7 DIV 2 = 3`).

## Reading Databricks errors

Every error has a class in brackets, a message, and often a suggestion:

```
[UNRESOLVED_COLUMN.WITH_SUGGESTION] A column, variable, or function parameter with name
`custmer_id` cannot be resolved. Did you mean one of the following? [`customer_id`, …]
```

The class is stable and searchable. The most common ones, all reproduced by the playground:

| Class | Usual cause |
|---|---|
| `UNRESOLVED_COLUMN` | Typo, or a column from a table not in FROM |
| `AMBIGUOUS_REFERENCE` | The same column name in two joined tables: qualify it |
| `MISSING_AGGREGATION` | A SELECT column neither grouped nor aggregated |
| `TABLE_OR_VIEW_NOT_FOUND` | Typo, or wrong catalog or schema |
| `DIVIDE_BY_ZERO`, `CAST_INVALID_INPUT` | ANSI mode doing its job |
| `DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE` | Duplicate keys in a MERGE source |

**Practise:** the Foundations track, then [`not-in-null`](https://aboualyxcode.github.io/select-from-production/#not-in-null).
