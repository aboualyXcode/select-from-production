-- Aggregation · Core · Monthly activity
-- Playground: https://aboualyxcode.github.io/select-from-production/#monthly-activity
--
-- Product wants to know whether customers order more often, or whether there are simply more
-- customers.
--
-- TASK: Per month of `order_ts` (formatted `yyyy-MM` as `month`), return `orders`, `customers`
-- (distinct) and `orders_per_customer` rounded to 2. All statuses count. Order by month.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Your SQL here

