-- Window functions · Core · Spend quartiles
-- Playground: https://aboualyxcode.github.io/select-from-production/#spend-quartiles
--
-- Marketing segments paying customers into four equal-sized groups by lifetime spend.
--
-- TASK: For customers with at least one PAID order, return `customer_id`, `spend` (rounded to 2)
-- and `quartile` (1 = top spenders) using NTILE(4), ordered by spend descending with ties broken
-- by customer_id. Order the output by customer_id.
--
-- Tables: orders, order_items

USE SCHEMA stagedoor;

-- Reference solution
WITH s AS (
  SELECT o.customer_id, SUM(i.quantity * i.unit_price) AS spend
  FROM orders o JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'PAID'
  GROUP BY o.customer_id
)
SELECT customer_id, ROUND(spend, 2) AS spend,
       NTILE(4) OVER (ORDER BY spend DESC, customer_id) AS quartile
FROM s
ORDER BY customer_id;

-- Another way
SELECT o.customer_id, ROUND(SUM(i.quantity * i.unit_price), 2) AS spend, NTILE(4) OVER (ORDER BY SUM(i.quantity * i.unit_price) DESC, o.customer_id) AS quartile FROM orders o JOIN order_items i USING (order_id) WHERE o.status = 'PAID' GROUP BY o.customer_id ORDER BY 1;

-- WHY IT MATTERS: NTILE splits rows into equal-count buckets; earlier buckets get the extra rows
-- when the count does not divide evenly. For value-based bands, use percentiles or CASE instead.
