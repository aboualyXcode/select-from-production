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

-- Your SQL here

