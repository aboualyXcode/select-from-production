-- Semi-structured data · Warm-up · App events by type and OS
-- Playground: https://aboualyxcode.github.io/select-from-production/#json-paths
--
-- Mobile engineering wants event volume per event type and operating system. The events are JSON
-- strings.
--
-- TASK: Return `event_type` (the JSON field `event`), `os` (`device.os`) and `events`. Order by
-- event_type, then os.
--
-- Tables: app_events

USE SCHEMA stagedoor;

-- Your SQL here

