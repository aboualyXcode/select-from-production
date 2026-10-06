-- Window functions · Core · Month-over-month growth
-- Playground: https://aboualyxcode.github.io/select-from-production/#mom-growth
--
-- The board deck needs monthly paid revenue and growth versus the previous month.
--
-- TASK: Return `month` (`yyyy-MM`), `revenue`, `prev_revenue` and `growth_pct` = (revenue − prev)
-- / prev × 100 rounded to 1, for PAID orders. Round revenues to 2. The first month has NULL
-- growth. Order by month.
--
-- Tables: orders, order_items

USE SCHEMA stagedoor;

-- Your SQL here

