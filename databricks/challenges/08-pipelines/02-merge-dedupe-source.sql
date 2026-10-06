-- Pipelines and MERGE · Hard · The MERGE that fails
-- Playground: https://aboualyxcode.github.io/select-from-production/#merge-dedupe-source
--
-- The nightly job MERGEs `price_feed` into `event_prices` and started failing. The feed now
-- contains several rows per event, and sometimes stale ones. The job is in the editor.
--
-- TASK: Fix it. For each event, apply only the latest row of the feed, and never overwrite a row
-- in `event_prices` with an older `updated_at`. Insert events that are new.
--
-- Tables: event_prices, price_feed
-- This challenge changes data. The setup below creates the tables it needs; rerun it to start over.
-- Check your result with:
--   SELECT event_id, base_price, updated_at FROM event_prices ORDER BY event_id
-- Your statements must be idempotent: running them twice must leave the same result.

USE SCHEMA stagedoor;

-- Setup
CREATE OR REPLACE TABLE event_prices (event_id INT NOT NULL, base_price DOUBLE, updated_at TIMESTAMP);
INSERT INTO event_prices SELECT event_id, base_price, TIMESTAMP'2026-06-01 00:00:00' FROM events WHERE event_id <= 120;
CREATE OR REPLACE TABLE price_feed (event_id INT, base_price DOUBLE, updated_at TIMESTAMP);
INSERT INTO price_feed VALUES
  (101, 61.0, TIMESTAMP'2026-06-20 08:00:00'), (101, 64.0, TIMESTAMP'2026-06-21 08:00:00'),
  (102, 70.0, TIMESTAMP'2026-06-20 08:00:00'), (102, 70.0, TIMESTAMP'2026-06-20 08:00:00'),
  (103, 10.0, TIMESTAMP'2026-05-01 08:00:00'),
  (140, 88.0, TIMESTAMP'2026-06-22 08:00:00');

-- The query you were handed:
MERGE INTO event_prices t
USING price_feed s
ON t.event_id = s.event_id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;

