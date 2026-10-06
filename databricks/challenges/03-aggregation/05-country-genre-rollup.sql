-- Aggregation · Hard · Subtotals with ROLLUP
-- Playground: https://aboualyxcode.github.io/select-from-production/#country-genre-rollup
--
-- Finance wants revenue by customer country and genre, with a subtotal per country and a grand
-- total, in one result.
--
-- TASK: For PAID orders, return `country`, `genre` and `revenue` (rounded to 2), with subtotal
-- rows (genre NULL) and a grand total (both NULL). Order by country, then genre, with NULLs last.
--
-- Tables: orders, order_items, customers, events

USE SCHEMA stagedoor;

-- Your SQL here

