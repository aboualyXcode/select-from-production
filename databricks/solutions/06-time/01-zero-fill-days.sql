-- Dates and time series · Core · Tickets per day, including quiet days
-- Playground: https://aboualyxcode.github.io/select-from-production/#zero-fill-days
--
-- The support dashboard's daily chart skips days with no tickets, which makes quiet days
-- invisible.
--
-- TASK: Return every `day` from 2026-01-01 to 2026-01-14 (inclusive) and `tickets`: support
-- tickets opened that day, 0 for days with none. Order by day.
--
-- Tables: support_tickets

USE SCHEMA stagedoor;

-- Reference solution
WITH days AS (
  SELECT explode(sequence(DATE'2026-01-01', DATE'2026-01-14')) AS day
)
SELECT d.day, COUNT(t.ticket_id) AS tickets
FROM days d
LEFT JOIN support_tickets t ON CAST(t.opened_ts AS DATE) = d.day
GROUP BY d.day
ORDER BY d.day;

-- Another way
SELECT date_add(DATE'2026-01-01', id) AS day, (SELECT COUNT(*) FROM support_tickets t WHERE to_date(t.opened_ts) = date_add(DATE'2026-01-01', id)) AS tickets FROM range(14) ORDER BY 1;

-- WHY IT MATTERS: Aggregates only produce rows for values that exist. A calendar (a date
-- dimension, or `sequence` + `explode`) is how time series get explicit zeros, and LAG-based
-- comparisons only work once every period is present.
