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

-- Reference solution
WITH order_totals AS (
  SELECT o.order_id, o.channel, SUM(i.quantity * i.unit_price) AS total
  FROM orders o JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'PAID'
  GROUP BY ALL
)
SELECT channel, ROUND(AVG(total), 2) AS avg_order_value
FROM order_totals
GROUP BY channel
ORDER BY channel;

-- Another way
SELECT o.channel, ROUND(SUM(i.quantity * i.unit_price) / COUNT(DISTINCT o.order_id), 2) AS avg_order_value FROM orders o JOIN order_items i USING (order_id) WHERE o.status = 'PAID' GROUP BY 1 ORDER BY 1;

-- WHY IT MATTERS: Two classics: averaging at the wrong grain (lines instead of orders), and
-- averaging averages. Compute a ratio metric as total ÷ count at the grain the business means.
