-- Dates and time series · Core · Support SLA by priority
-- Playground: https://aboualyxcode.github.io/select-from-production/#support-sla
--
-- Support promises a resolution within 24 hours. The SLA review needs one row per priority.
--
-- TASK: Per `priority`, return `tickets`, `closed`, `avg_hours` (average resolution time of closed
-- tickets, in hours, rounded to 1) and `within_24h_pct` (closed within 24 hours as a share of
-- closed tickets, rounded to 1). Order urgent, high, medium, low.
--
-- Tables: support_tickets

USE SCHEMA stagedoor;

-- Reference solution
SELECT priority,
       COUNT(*) AS tickets,
       COUNT(closed_ts) AS closed,
       ROUND(AVG((unix_timestamp(closed_ts) - unix_timestamp(opened_ts)) / 3600), 1) AS avg_hours,
       ROUND(100 * count_if(closed_ts <= opened_ts + INTERVAL 24 HOURS) / COUNT(closed_ts), 1) AS within_24h_pct
FROM support_tickets
GROUP BY priority
ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END;

-- Another way
SELECT priority, COUNT(*) AS tickets, count_if(status = 'closed') AS closed, ROUND(AVG(timestampdiff(SECOND, opened_ts, closed_ts)) / 3600, 1) AS avg_hours, ROUND(100 * AVG(CASE WHEN closed_ts IS NOT NULL THEN IF(timestampdiff(SECOND, opened_ts, closed_ts) <= 86400, 1, 0) END), 1) AS within_24h_pct FROM support_tickets GROUP BY ALL ORDER BY array_position(array('urgent', 'high', 'medium', 'low'), priority);

-- WHY IT MATTERS: Timestamps subtract to an interval; unix_timestamp and timestampdiff turn
-- durations into numbers you can average. Watch the denominator of a rate: "within SLA" is a share
-- of closed tickets here, not of all tickets.
