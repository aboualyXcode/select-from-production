-- Pipelines and MERGE · Core · An incremental daily load
-- Playground: https://aboualyxcode.github.io/select-from-production/#incremental-load
--
-- `daily_sales` is loaded up to the end of February 2026. The job must append newer days only, and
-- a retry must not double anything.
--
-- TASK: Append one row per day after the latest day already in `daily_sales`: `day`, `paid_orders`
-- (distinct PAID orders) and `revenue` (rounded to 2), computed from orders and order_items.
--
-- Tables: daily_sales, orders, order_items
-- This challenge changes data. The setup below creates the tables it needs; rerun it to start over.
-- Check your result with:
--   SELECT day, paid_orders, revenue FROM daily_sales ORDER BY day
-- Your statements must be idempotent: running them twice must leave the same result.

USE SCHEMA stagedoor;

-- Setup
CREATE OR REPLACE TABLE daily_sales (day DATE NOT NULL, paid_orders INT, revenue DOUBLE);
INSERT INTO daily_sales
SELECT CAST(o.order_ts AS DATE), COUNT(DISTINCT o.order_id), ROUND(SUM(i.quantity * i.unit_price), 2)
FROM orders o JOIN order_items i ON i.order_id = o.order_id
WHERE o.status = 'PAID' AND o.order_ts < '2026-03-01'
GROUP BY 1;

-- Reference solution
INSERT INTO daily_sales
SELECT CAST(o.order_ts AS DATE) AS day,
       COUNT(DISTINCT o.order_id) AS paid_orders,
       ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
WHERE o.status = 'PAID'
  AND CAST(o.order_ts AS DATE) > (SELECT MAX(day) FROM daily_sales)
GROUP BY 1;

-- Another way (commented out: run it instead of the reference solution, after rerunning the setup)
-- MERGE INTO daily_sales t USING (SELECT to_date(order_ts) AS day, COUNT(DISTINCT order_id) AS paid_orders, ROUND(SUM(quantity * unit_price), 2) AS revenue FROM orders JOIN order_items USING (order_id) WHERE status = 'PAID' GROUP BY 1) s ON t.day = s.day WHEN NOT MATCHED THEN INSERT *;

-- WHY IT MATTERS: A high-water mark makes a batch load incremental and idempotent. Its weakness is
-- late data: an order that arrives after its day was loaded is never picked up. Production
-- pipelines either reprocess a trailing window with MERGE, or use streaming tables, which track
-- what has already been processed.

SELECT day, paid_orders, revenue FROM daily_sales ORDER BY day;
