-- Pipelines and MERGE · Core · Upsert price changes
-- Playground: https://aboualyxcode.github.io/select-from-production/#merge-upsert
--
-- Pricing publishes changes to `price_updates`: some events changed price, some are new to the
-- price table.
--
-- TASK: Apply `price_updates` to `event_prices`: update existing events (price and updated_at),
-- insert new ones. Running your statement twice must give the same result.
--
-- Tables: event_prices, price_updates
-- This challenge changes data. The setup below creates the tables it needs; rerun it to start over.
-- Check your result with:
--   SELECT event_id, base_price, updated_at FROM event_prices ORDER BY event_id
-- Your statements must be idempotent: running them twice must leave the same result.

USE SCHEMA stagedoor;

-- Setup
CREATE OR REPLACE TABLE event_prices (event_id INT NOT NULL, base_price DOUBLE, updated_at TIMESTAMP);
INSERT INTO event_prices SELECT event_id, base_price, TIMESTAMP'2026-06-01 00:00:00' FROM events WHERE event_id <= 120;
CREATE OR REPLACE TABLE price_updates (event_id INT, base_price DOUBLE, updated_at TIMESTAMP);
INSERT INTO price_updates VALUES (101, 59.0, TIMESTAMP'2026-06-20 09:00:00'), (102, 79.5, TIMESTAMP'2026-06-20 09:00:00'), (125, 99.0, TIMESTAMP'2026-06-20 09:00:00'), (131, 45.0, TIMESTAMP'2026-06-20 09:00:00');

-- Reference solution
MERGE INTO event_prices t
USING price_updates s
ON t.event_id = s.event_id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;

-- Another way (commented out: run it instead of the reference solution, after rerunning the setup)
-- UPDATE event_prices SET base_price = (SELECT s.base_price FROM price_updates s WHERE s.event_id = event_prices.event_id), updated_at = (SELECT s.updated_at FROM price_updates s WHERE s.event_id = event_prices.event_id) WHERE event_id IN (SELECT event_id FROM price_updates);
-- INSERT INTO event_prices SELECT * FROM price_updates s WHERE s.event_id NOT IN (SELECT event_id FROM event_prices);

-- WHY IT MATTERS: MERGE applies inserts and updates atomically in one Delta transaction, so
-- readers never see half an update. It is also naturally idempotent: rerunning it finds nothing
-- new to change. A plain INSERT is not, and duplicates every key on a retry.

SELECT event_id, base_price, updated_at FROM event_prices ORDER BY event_id;
