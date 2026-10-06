-- Window functions · Hard · How often do loyal customers buy?
-- Playground: https://aboualyxcode.github.io/select-from-production/#days-between-orders
--
-- The loyalty team wants the average gap between consecutive orders for frequent buyers.
--
-- TASK: For customers with at least 10 orders (any status), return `customer_id`, `orders` and
-- `avg_days_between`: the average number of days between each order and the previous one (by
-- calendar date, using datediff), rounded to 1. Order by customer_id.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Your SQL here

