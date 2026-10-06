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

-- Reference solution
WITH bounds AS (
  SELECT event_id, MIN(snapshot_date) AS first_day, MAX(snapshot_date) AS last_day
  FROM seat_inventory
  GROUP BY event_id
), expected AS (
  SELECT event_id, explode(sequence(first_day, last_day)) AS day
  FROM bounds
)
SELECT e.event_id, e.day AS missing_date
FROM expected e
LEFT ANTI JOIN seat_inventory s ON s.event_id = e.event_id AND s.snapshot_date = e.day
ORDER BY 1, 2;

-- Another way
SELECT event_id, explode(sequence(date_add(snapshot_date, 1), date_sub(next_day, 1))) AS missing_date FROM (SELECT event_id, snapshot_date, LEAD(snapshot_date) OVER (PARTITION BY event_id ORDER BY snapshot_date) AS next_day FROM seat_inventory) WHERE datediff(next_day, snapshot_date) > 1 ORDER BY 1, 2;

-- WHY IT MATTERS: Gap detection is a production staple: missing partitions, missed heartbeats,
-- failed snapshots. Generating what should exist and anti-joining what does is the general
-- pattern.
