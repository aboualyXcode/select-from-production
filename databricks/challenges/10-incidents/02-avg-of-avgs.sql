-- Incidents · Core · Average order value is off
-- Playground: https://aboualyxcode.github.io/select-from-production/#avg-of-avgs
--
-- The channel dashboard's average order value disagrees with finance. The query is in the editor.
--
-- TASK: Fix it. Return `channel` and `avg_order_value`: the average total of PAID orders (an
-- order's total is the sum of its lines), rounded to 2. Order by channel.
--
-- Tables: orders, order_items

USE SCHEMA stagedoor;

-- The query you were handed:
WITH per_customer AS (
  SELECT o.channel, o.customer_id, AVG(i.quantity * i.unit_price) AS aov
  FROM orders o JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'PAID'
  GROUP BY ALL
)
SELECT channel, ROUND(AVG(aov), 2) AS avg_order_value
FROM per_customer
GROUP BY channel
ORDER BY channel;

