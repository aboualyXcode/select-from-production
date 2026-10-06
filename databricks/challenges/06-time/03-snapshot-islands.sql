-- Dates and time series · Hard · Unbroken snapshot runs
-- Playground: https://aboualyxcode.github.io/select-from-production/#snapshot-islands
--
-- Forecasting only trusts unbroken runs of daily snapshots.
--
-- TASK: For each event, return each run of consecutive snapshot days: `event_id`, `run_start`,
-- `run_end` and `days`. Order by event_id, run_start.
--
-- Tables: seat_inventory

USE SCHEMA stagedoor;

-- Your SQL here

