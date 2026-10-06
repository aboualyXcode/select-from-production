-- Window functions · Hard · How often do loyal customers buy?
-- Playground: https://aboualyxcode.github.io/select-from-production/#days-between-orders
--
-- The loyalty team wants the average gap between consecutive orders for frequent buyers.
--
-- TASK: For customers with at least 10 orders (any status), return `customer_id`, `orders` and
-- `avg_days_between`: the average number of days between each order and the previous one (by
-- calendar date, using datediff), rounded to 1. Order by customer_id.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Reference solution
WITH gaps AS (
  SELECT customer_id,
         datediff(order_ts, LAG(order_ts) OVER (PARTITION BY customer_id ORDER BY order_ts)) AS gap
  FROM orders
)
SELECT customer_id, COUNT(*) AS orders, ROUND(AVG(gap), 1) AS avg_days_between
FROM gaps
GROUP BY customer_id
HAVING COUNT(*) >= 10
ORDER BY customer_id;

-- Another way
SELECT customer_id, COUNT(*) AS orders, ROUND(AVG(gap), 1) AS avg_days_between FROM (SELECT customer_id, datediff(order_ts, LAG(order_ts) OVER (PARTITION BY customer_id ORDER BY order_ts)) AS gap, COUNT(*) OVER (PARTITION BY customer_id) AS n FROM orders) WHERE n >= 10 GROUP BY customer_id ORDER BY 1;

-- WHY IT MATTERS: Window functions run after WHERE, so filtering customers before computing LAG
-- would remove orders and change the gaps. Compute the window over all rows, then filter on the
-- aggregate.
