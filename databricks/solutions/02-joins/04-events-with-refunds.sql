-- Joins · Core · Events with refunds
-- Playground: https://aboualyxcode.github.io/select-from-production/#events-with-refunds
--
-- Customer success is reviewing every event that had at least one refund.
--
-- TASK: Return `event_id` and `event_name` of events with at least one refund, once each. Order by
-- `event_id`.
--
-- Tables: events, orders, refunds

USE SCHEMA stagedoor;

-- Reference solution
SELECT e.event_id, e.event_name
FROM events e
LEFT SEMI JOIN (
  SELECT o.event_id
  FROM orders o
  JOIN refunds r ON r.order_id = o.order_id
) x ON x.event_id = e.event_id
ORDER BY e.event_id;

-- Another way
SELECT DISTINCT e.event_id, e.event_name FROM events e JOIN orders o ON o.event_id = e.event_id JOIN refunds r ON r.order_id = o.order_id ORDER BY 1;

-- WHY IT MATTERS: A semi join answers "does a match exist?" without multiplying rows, so there is
-- nothing to DISTINCT away afterwards. Reaching for DISTINCT to fix duplicates often hides a join
-- that should have been a semi join.
