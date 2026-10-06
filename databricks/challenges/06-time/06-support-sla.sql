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

-- Your SQL here

