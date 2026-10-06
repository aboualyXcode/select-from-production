-- Aggregation · Core · Each customer's latest channel
-- Playground: https://aboualyxcode.github.io/select-from-production/#last-channel
--
-- CRM personalises messages by the channel a customer used most recently.
--
-- TASK: For each customer with orders, return `customer_id`, `last_order_ts` and `last_channel`
-- (the channel of their most recent order). Order by customer_id.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Your SQL here

