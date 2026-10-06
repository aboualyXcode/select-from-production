-- Aggregation · Core · Channel scorecard
-- Playground: https://aboualyxcode.github.io/select-from-production/#channel-scorecard
--
-- The weekly business review compares channels on one row each.
--
-- TASK: Per `channel`, return `orders`, `paid`, `cancelled`, `refunded` (counts by status) and
-- `paid_rate` = paid / orders, rounded to 3. Order by channel.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Your SQL here

