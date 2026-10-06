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

-- Reference solution
SELECT payload:event AS event_type, payload:device.os AS os, COUNT(*) AS events
FROM app_events
GROUP BY ALL
ORDER BY event_type, os;

-- Another way
SELECT get_json_object(payload, '$.event') AS event_type, get_json_object(payload, '$.device.os') AS os, COUNT(*) AS events FROM app_events GROUP BY 1, 2 ORDER BY 1, 2;

-- WHY IT MATTERS: The colon operator is Databricks shorthand for JSON path extraction on strings,
-- and returns strings. For repeated or heavy use, parse once with `from_json` (next challenge) or
-- store the data as a VARIANT or STRUCT column.
