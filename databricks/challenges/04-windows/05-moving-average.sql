-- Window functions · Core · Smoothing the seat count
-- Playground: https://aboualyxcode.github.io/select-from-production/#moving-average
--
-- The demand-forecasting model uses a 3-snapshot moving average of remaining seats.
--
-- TASK: For event 101, return `snapshot_date`, `seats_remaining` and `moving_avg`: the average of
-- the current and two previous snapshots, rounded to 1. Order by snapshot_date.
--
-- Tables: seat_inventory

USE SCHEMA stagedoor;

-- Your SQL here

