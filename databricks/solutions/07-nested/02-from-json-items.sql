-- Semi-structured data · Hard · Tickets in purchase events
-- Playground: https://aboualyxcode.github.io/select-from-production/#from-json-items
--
-- The app reports purchases as JSON with a nested list of items. Reconciliation needs tickets per
-- event from those payloads.
--
-- TASK: For app events whose `event` is `purchase`, parse `items` (each has `event_id` and `qty`)
-- and return `event_id` and `tickets` (sum of qty). Order by event_id.
--
-- Tables: app_events

USE SCHEMA stagedoor;

-- Reference solution
WITH items AS (
  SELECT inline(from_json(payload:items, 'ARRAY<STRUCT<event_id: INT, qty: INT>>'))
  FROM app_events
  WHERE payload:event = 'purchase'
)
SELECT event_id, SUM(qty) AS tickets
FROM items
GROUP BY event_id
ORDER BY event_id;

-- Another way
SELECT item.event_id, SUM(item.qty) AS tickets FROM app_events LATERAL VIEW explode(from_json(get_json_object(payload, '$.items'), 'ARRAY<STRUCT<event_id: INT, qty: INT>>')) e AS item WHERE get_json_object(payload, '$.event') = 'purchase' GROUP BY 1 ORDER BY 1;

-- WHY IT MATTERS: Parse JSON once into typed structs, then use ordinary SQL. In a pipeline this
-- happens in Silver, so downstream queries never touch raw JSON strings.
