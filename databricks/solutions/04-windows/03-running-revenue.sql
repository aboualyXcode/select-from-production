-- Window functions · Core · Running revenue in January
-- Playground: https://aboualyxcode.github.io/select-from-production/#running-revenue
--
-- The finance team tracks January 2026 revenue against target day by day.
--
-- TASK: For PAID orders placed in January 2026, return `day` (a DATE), `revenue` that day and
-- `running_revenue` (month to date), both rounded to 2. Order by day.
--
-- Tables: orders, order_items

USE SCHEMA stagedoor;

-- Reference solution
SELECT CAST(o.order_ts AS DATE) AS day,
       ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue,
       ROUND(SUM(SUM(i.quantity * i.unit_price)) OVER (ORDER BY CAST(o.order_ts AS DATE)), 2) AS running_revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
WHERE o.status = 'PAID'
  AND o.order_ts >= '2026-01-01' AND o.order_ts < '2026-02-01'
GROUP BY 1
ORDER BY 1;

-- Another way
WITH d AS (SELECT to_date(order_ts) AS day, SUM(quantity * unit_price) AS rev FROM orders JOIN order_items USING (order_id) WHERE status = 'PAID' AND date_format(order_ts, 'yyyy-MM') = '2026-01' GROUP BY 1) SELECT day, ROUND(rev, 2) AS revenue, ROUND(SUM(rev) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 2) AS running_revenue FROM d ORDER BY day;

-- WHY IT MATTERS: Round at the end, not before summing: rounding each day first and then
-- accumulating can drift by cents. With ORDER BY and no frame, a window defaults to RANGE
-- UNBOUNDED PRECEDING to the current row, which includes ties.
