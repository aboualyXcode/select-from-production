-- Joins · Warm-up · Who bought tickets for event 112?
-- Playground: https://aboualyxcode.github.io/select-from-production/#enrich-orders
--
-- The venue for event 112 wants a guest list with names and the venue they bought for.
--
-- TASK: For orders of `event_id = 112`, return `order_id`, the customer's `full_name` and the
-- venue `name` as `venue`. Order by `order_id`.
--
-- Tables: orders, customers, events, venues

USE SCHEMA stagedoor;

-- Reference solution
SELECT o.order_id, c.full_name, v.name AS venue
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
JOIN events e ON e.event_id = o.event_id
JOIN venues v ON v.venue_id = e.venue_id
WHERE o.event_id = 112
ORDER BY o.order_id;

-- Another way
SELECT order_id, full_name, v.name AS venue FROM orders JOIN customers USING (customer_id) JOIN events e USING (event_id) JOIN venues v ON v.venue_id = e.venue_id WHERE event_id = 112 ORDER BY order_id;

-- WHY IT MATTERS: Alias every table and qualify every column in multi-table queries. It prevents
-- `AMBIGUOUS_REFERENCE` errors when two tables share a column name, and it shows readers where
-- each value comes from.
