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

-- Reference solution
WITH g AS (
  SELECT event_id, snapshot_date,
         date_sub(snapshot_date, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY snapshot_date)) AS grp
  FROM seat_inventory
)
SELECT event_id, MIN(snapshot_date) AS run_start, MAX(snapshot_date) AS run_end, COUNT(*) AS days
FROM g
GROUP BY event_id, grp
ORDER BY event_id, run_start;

-- Another way
WITH f AS (SELECT event_id, snapshot_date, IF(datediff(snapshot_date, LAG(snapshot_date) OVER (PARTITION BY event_id ORDER BY snapshot_date)) = 1, 0, 1) AS new_run FROM seat_inventory), r AS (SELECT *, SUM(new_run) OVER (PARTITION BY event_id ORDER BY snapshot_date ROWS UNBOUNDED PRECEDING) AS run_no FROM f) SELECT event_id, MIN(snapshot_date) AS run_start, MAX(snapshot_date) AS run_end, COUNT(*) AS days FROM r GROUP BY event_id, run_no ORDER BY 1, 2;

-- WHY IT MATTERS: This is the "gaps and islands" pattern. The row-number trick works for strictly
-- consecutive values; the flag-and-running-sum version (see the alternative) generalizes to any
-- rule for "a new group starts here", such as session timeouts.
