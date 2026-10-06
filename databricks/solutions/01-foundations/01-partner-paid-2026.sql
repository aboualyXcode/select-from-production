-- Foundations · Warm-up · Partner sales this year
-- Playground: https://aboualyxcode.github.io/select-from-production/#partner-paid-2026
--
-- The partnerships team pays commission on paid orders that came through the partner channel.
--
-- TASK: Return `order_id`, `customer_id` and `order_ts` for every PAID order from the partner
-- channel placed in 2026. Newest first; break ties by `order_id`.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT order_id, customer_id, order_ts
FROM orders
WHERE status = 'PAID'
  AND channel = 'partner'
  AND order_ts >= '2026-01-01'
ORDER BY order_ts DESC, order_id;

-- Another way
SELECT order_id, customer_id, order_ts FROM orders WHERE year(order_ts) = 2026 AND status = 'PAID' AND channel = 'partner' ORDER BY 3 DESC, 1;

-- WHY IT MATTERS: Filtering on a timestamp with a range (`>= '2026-01-01'`) lets Delta skip files
-- by min/max statistics. Wrapping the column in a function (`year(order_ts)`) gives the same
-- answer but can prevent that skipping on large tables.
