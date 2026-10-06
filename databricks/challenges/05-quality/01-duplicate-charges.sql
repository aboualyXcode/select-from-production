-- Data quality · Core · Customers charged twice
-- Playground: https://aboualyxcode.github.io/select-from-production/#duplicate-charges
--
-- A payment-gateway retry bug charged some customers twice. Finance needs the list to issue
-- refunds.
--
-- TASK: For orders with more than one SETTLED payment, return `order_id`, `charges`,
-- `total_charged` and `overcharge` (total minus a single charge), amounts rounded to 2. Order by
-- order_id.
--
-- Tables: payments

USE SCHEMA stagedoor;

-- Your SQL here

