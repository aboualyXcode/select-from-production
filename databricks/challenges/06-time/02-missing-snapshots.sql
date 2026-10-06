-- Dates and time series · Hard · Which snapshot days are missing?
-- Playground: https://aboualyxcode.github.io/select-from-production/#missing-snapshots
--
-- The seat-inventory job failed on some days. Operations needs the exact dates to backfill.
--
-- TASK: For each event in `seat_inventory`, find the dates between its first and last snapshot
-- that have no snapshot. Return `event_id` and `missing_date`, ordered by both.
--
-- Tables: seat_inventory

USE SCHEMA stagedoor;

-- Your SQL here

