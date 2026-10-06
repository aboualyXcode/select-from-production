-- Pipelines and MERGE · Core · Publish a Gold table
-- Playground: https://aboualyxcode.github.io/select-from-production/#ctas-summary
--
-- The CRM sync reads a `customer_summary` table every morning.
--
-- TASK: Create `customer_summary` with one row per customer who has at least one order:
-- `customer_id`, `orders` (all statuses), `paid_revenue` (sum of line totals of PAID orders, 0 if
-- none, rounded to 2), `first_order_ts` and `last_order_ts`. Column names matter here.
--
-- Tables: orders, order_items
-- This challenge changes data. The setup below creates the tables it needs; rerun it to start over.
-- Check your result with:
--   SELECT customer_id, orders, paid_revenue, first_order_ts, last_order_ts FROM customer_summary ORDER BY customer_id

USE SCHEMA stagedoor;

-- Reference solution
CREATE OR REPLACE TABLE customer_summary AS
WITH order_totals AS (
  SELECT o.order_id, o.customer_id, o.status, o.order_ts, SUM(i.quantity * i.unit_price) AS total
  FROM orders o JOIN order_items i ON i.order_id = o.order_id
  GROUP BY ALL
)
SELECT customer_id,
       COUNT(*) AS orders,
       ROUND(coalesce(SUM(total) FILTER (WHERE status = 'PAID'), 0), 2) AS paid_revenue,
       MIN(order_ts) AS first_order_ts,
       MAX(order_ts) AS last_order_ts
FROM order_totals
GROUP BY customer_id;

-- Another way (commented out: run it instead of the reference solution, after rerunning the setup)
-- CREATE TABLE customer_summary AS SELECT o.customer_id, COUNT(DISTINCT o.order_id) AS orders, ROUND(SUM(IF(o.status = 'PAID', i.quantity * i.unit_price, 0)), 2) AS paid_revenue, MIN(o.order_ts) AS first_order_ts, MAX(o.order_ts) AS last_order_ts FROM orders o JOIN order_items i USING (order_id) GROUP BY o.customer_id;

-- WHY IT MATTERS: `CREATE OR REPLACE TABLE … AS SELECT` rebuilds a table atomically: readers see
-- the old version until the new one is committed, and the table history keeps both. On a real
-- pipeline, a materialized view gives you the same with incremental refresh.

SELECT customer_id, orders, paid_revenue, first_order_ts, last_order_ts FROM customer_summary ORDER BY customer_id;
