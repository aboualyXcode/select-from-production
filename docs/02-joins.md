# 2. Joins

Most wrong numbers in production come from joins: rows that silently disappear, or rows that silently multiply. Before writing a join, answer two questions: **what is the grain of each side** (one row per what?), and **what should happen to rows without a match**?

## Choosing the join

| You want | Use | Rows per left row |
|---|---|---|
| Matching pairs only | `JOIN` (inner) | 0…n |
| Every left row, matched or not | `LEFT JOIN` | 1…n |
| Left rows that **have** a match | `LEFT SEMI JOIN` | 0 or 1 |
| Left rows that have **no** match | `LEFT ANTI JOIN` | 0 or 1 |
| Everything from both sides | `FULL OUTER JOIN` | 1…n |
| Every combination | `CROSS JOIN` | n |

Semi and anti joins are Databricks syntax for `EXISTS` and `NOT EXISTS`. They never duplicate the left side, so there is nothing to `DISTINCT` away afterwards.

```sql
-- customers who never ordered
SELECT c.customer_id, c.full_name
FROM customers c
LEFT ANTI JOIN orders o ON o.customer_id = c.customer_id;
```

## The LEFT JOIN that became an INNER JOIN

```sql
-- Wrong: customers without paid orders disappear
SELECT c.customer_id, COUNT(o.order_id)
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.status = 'PAID'            -- NULL for unmatched customers → row removed
GROUP BY c.customer_id;
```

Conditions on the right-hand table belong in `ON`, where they decide what matches, not in `WHERE`, where they remove rows after the join. And count a right-hand column, not `*`: `COUNT(*)` counts the NULL row a LEFT JOIN creates for each unmatched customer. Practise: [paid orders per customer](https://aboualyxcode.github.io/select-from-production/#paid-orders-per-customer).

## Fan-out

Joining a parent to two child tables multiplies their rows: an order with 3 lines and 2 payments becomes 6 rows, and summing line totals counts each line twice.

```
orders ─┬─ order_items   (n lines)
        └─ payments      (m payments)   → n × m rows per order
```

Fixes, in order of preference:

1. Join only the tables the measure needs.
2. Aggregate each child to the parent's grain first (one row per order), then join.
3. As a last resort, aggregate distinct keys. `SUM(DISTINCT amount)` is almost always wrong: it also merges equal amounts.

A quick fan-out test: count rows before and after each join, or check `COUNT(*) = COUNT(DISTINCT key)` at the grain you expect. Practise: [revenue per event is too high](https://aboualyxcode.github.io/select-from-production/#fanout-revenue).

## Range joins

Exchange rates, prices and SCD Type 2 dimensions are valid over a period, so the join condition is a range:

```sql
JOIN fx_rates f
  ON f.currency = 'EUR'
 AND CAST(p.paid_ts AS DATE) BETWEEN f.valid_from AND f.valid_to
```

Decide explicitly whether the end is inclusive or exclusive, and compare like with like: a timestamp compared with a DATE treats the date as midnight, which silently drops the last day. Half-open intervals (`>= valid_from AND < valid_to`) are the safest convention for new tables. Practise: [PayPal payments in USD](https://aboualyxcode.github.io/select-from-production/#fx-range-join).

## USING, NATURAL and ambiguity

- `JOIN … USING (order_id)` joins on equal names and returns the column once. Other shared columns, such as `status` in both orders and payments, stay ambiguous and must be qualified.
- `NATURAL JOIN` joins on every shared column name. Avoid it: adding a column to either table silently changes the join.
- Alias every table in multi-table queries and qualify every column. It prevents `AMBIGUOUS_REFERENCE` and tells readers where values come from.

## Self joins and NULL keys

A self join is an ordinary join where both sides are the same table, as in employees and their managers. Use LEFT JOIN when the relationship is optional (the CEO has no manager).

Rows with a NULL join key never match anything, not even another NULL. That is usually what you want; when it isn't, join on `a <=> b`.

**Practise:** the Joins track.
