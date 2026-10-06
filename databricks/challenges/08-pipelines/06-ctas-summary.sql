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

-- Your SQL here

