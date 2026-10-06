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

-- Your SQL here

