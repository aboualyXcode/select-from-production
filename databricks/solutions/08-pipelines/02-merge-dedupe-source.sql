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

-- Reference solution
MERGE INTO event_prices t
USING (
  SELECT * FROM price_feed
  QUALIFY ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY updated_at DESC) = 1
) s
ON t.event_id = s.event_id
WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;

-- Another way (commented out: run it instead of the reference solution, after rerunning the setup)
-- MERGE INTO event_prices t USING (SELECT event_id, max_by(base_price, updated_at) AS base_price, MAX(updated_at) AS updated_at FROM price_feed GROUP BY event_id) s ON t.event_id = s.event_id WHEN MATCHED AND t.updated_at < s.updated_at THEN UPDATE SET * WHEN NOT MATCHED THEN INSERT *;

-- WHY IT MATTERS: Delta raises `DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE` rather
-- than guess which source row should win. Always deduplicate the source to one row per key, and
-- guard updates with a sequence column, so a replayed or late batch can never move data backwards.

SELECT event_id, base_price, updated_at FROM event_prices ORDER BY event_id;
