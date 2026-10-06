# 5. Semi-structured data

Event payloads, API responses and carts arrive as JSON, arrays and nested records. Databricks handles them natively, without a separate document store.

## JSON strings

```sql
SELECT payload:event            AS event_type,   -- colon: JSON path on a string column
       payload:device.os        AS os,
       payload:items[0].qty     AS first_qty,
       get_json_object(payload, '$.user.id') AS user_id
FROM app_events;
```

The colon operator and `get_json_object` return **strings**. Cast when you need numbers: `payload:items[0].qty::INT`.

Paths that don't exist return NULL rather than an error, so a renamed field silently becomes NULL. Count NULLs per field when monitoring a feed.

## Parse once with from_json

Extracting the same JSON paths in every query is slow and fragile. Parse once into typed structs, usually in Silver:

```sql
SELECT from_json(payload, 'STRUCT<event: STRING, user: STRUCT<id: INT>, items: ARRAY<STRUCT<event_id: INT, qty: INT>>>') AS e
FROM app_events;
```

After that, `e.user.id` is an INT and `e.items` is a real array. Databricks also has a `VARIANT` type, which stores semi-structured data efficiently without a fixed schema, and `schema_of_json` to infer a schema from a sample. Both are worth knowing; the playground covers `from_json` and the colon syntax.

## Arrays and structs

| Need | Function |
|---|---|
| Build | `array(…)`, `named_struct('k', v, …)`, `struct(a, b)`, `map(k, v, …)` |
| Access | `arr[0]` (0-based), `element_at(arr, 1)` (1-based, negative from the end), `s.field`, `m['key']` |
| Size and search | `size`, `array_contains`, `array_position` |
| Set operations | `array_distinct`, `array_union`, `array_intersect`, `array_except` |
| Sort and join | `array_sort`, `sort_array(arr, false)`, `array_join(arr, ', ')` |
| Aggregate into | `collect_list`, `collect_set` |

## Rows from arrays: explode, inline and LATERAL VIEW

```sql
-- one row per cart line
SELECT c.cart_id, item.event_id, item.qty
FROM carts c
LATERAL VIEW explode(c.items) e AS item;

-- an array of structs straight into columns
SELECT cart_id, inline(items) FROM carts;
```

| Generator | Output |
|---|---|
| `explode(array)` | One row per element (`col`) |
| `explode(map)` | One row per entry (`key`, `value`) |
| `posexplode(array)` | Position and element |
| `inline(array<struct>)` | One row per struct, one column per field |
| `…_outer` / `LATERAL VIEW OUTER` | Keeps rows whose array is empty or NULL |

**Exploding drops parents with empty arrays.** An empty cart vanishes from a cart-value report unless you use `explode_outer` / `LATERAL VIEW OUTER` ([cart values](https://aboualyxcode.github.io/select-from-production/#cart-values)).

## Without exploding: higher-order functions

Lambdas compute over arrays in place, keeping the parent's grain:

```sql
SELECT cart_id,
       size(filter(items, i -> i.ticket_type = 'VIP'))                       AS vip_lines,
       transform(items, i -> i.qty * i.unit_price)                           AS line_totals,
       aggregate(items, CAST(0 AS DOUBLE), (acc, i) -> acc + i.qty * i.unit_price) AS cart_value,
       exists(items, i -> i.qty >= 4)                                        AS has_group_booking
FROM carts;
```

`transform` can also take the index: `transform(arr, (x, i) -> …)`. Prefer higher-order functions when the result stays one row per parent; explode when you need to join or aggregate the elements across parents.

**Practise:** the Semi-structured data track.
