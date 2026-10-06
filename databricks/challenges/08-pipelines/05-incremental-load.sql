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

-- Your SQL here

