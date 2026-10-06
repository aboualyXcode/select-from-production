-- Dates and time series · Hard · Do new customers buy within 30 days?
-- Playground: https://aboualyxcode.github.io/select-from-production/#cohort-conversion
--
-- Growth measures how quickly each monthly sign-up cohort converts.
--
-- TASK: For customers who signed up in 2025, return `cohort_month` (`yyyy-MM` of signup_date),
-- `customers`, `converted_30d` (customers with a PAID order placed 0–30 days after signing up, by
-- datediff) and `pct_30d` rounded to 1. Order by cohort_month.
--
-- Tables: customers, orders

USE SCHEMA stagedoor;

-- Your SQL here

