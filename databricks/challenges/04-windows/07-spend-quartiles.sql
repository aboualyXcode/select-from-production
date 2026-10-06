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

-- Your SQL here

