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

-- Your SQL here

