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

-- Reference solution
SELECT r.refund_id, r.order_id, r.amount
FROM refunds r
LEFT ANTI JOIN orders o ON o.order_id = r.order_id
ORDER BY r.refund_id;

-- Another way
SELECT r.refund_id, r.order_id, r.amount FROM refunds r LEFT JOIN orders o ON o.order_id = r.order_id WHERE o.order_id IS NULL ORDER BY 1;

-- WHY IT MATTERS: Delta Lake foreign keys are informational, not enforced, so orphans like this
-- can exist. Checks like this one belong in pipeline tests or expectations.
