-- Data quality · Hard · Dates in three formats
-- Playground: https://aboualyxcode.github.io/select-from-production/#parse-dates
--
-- The same raw sign-ups store dates as ISO strings, ISO timestamps, or European `dd/MM/yyyy`, plus
-- some garbage.
--
-- TASK: Return `signup_id`, the raw `signup_date` as `raw`, and `signup_day`: a DATE parsed from
-- ISO (`yyyy-MM-dd`, optionally followed by a time) or `dd/MM/yyyy`, and NULL when it is neither
-- or not a real date. The query must not fail. Order by signup_id.
--
-- Tables: raw_signups

USE SCHEMA stagedoor;

-- Your SQL here

