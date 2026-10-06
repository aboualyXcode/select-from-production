-- Data quality · Warm-up · Refunds for orders that don't exist
-- Playground: https://aboualyxcode.github.io/select-from-production/#orphan-refunds
--
-- A reconciliation job flagged refunds that point at no order.
--
-- TASK: Return `refund_id`, `order_id` and `amount` of refunds whose order is not in `orders`.
-- Order by refund_id.
--
-- Tables: refunds, orders

USE SCHEMA stagedoor;

-- Your SQL here

