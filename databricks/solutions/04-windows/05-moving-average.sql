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

-- Reference solution
SELECT snapshot_date, seats_remaining,
       ROUND(AVG(seats_remaining) OVER (ORDER BY snapshot_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 1) AS moving_avg
FROM seat_inventory
WHERE event_id = 101
ORDER BY snapshot_date;

-- Another way
SELECT snapshot_date, seats_remaining, ROUND((seats_remaining + coalesce(LAG(seats_remaining, 1) OVER w, 0) + coalesce(LAG(seats_remaining, 2) OVER w, 0)) / (1 + IF(LAG(seats_remaining, 1) OVER w IS NULL, 0, 1) + IF(LAG(seats_remaining, 2) OVER w IS NULL, 0, 1)), 1) AS moving_avg FROM seat_inventory WHERE event_id = 101 WINDOW w AS (ORDER BY snapshot_date) ORDER BY 1;

-- WHY IT MATTERS: ROWS counts rows; RANGE counts values. Snapshots are missing on some days here,
-- so "the last 3 rows" is not "the last 3 days". For a true 3-day window, zero-fill the dates
-- first or use a RANGE frame on a numeric day number.
