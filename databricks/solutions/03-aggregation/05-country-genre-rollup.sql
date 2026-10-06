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

-- Reference solution
SELECT c.country, e.genre, ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
JOIN customers c ON c.customer_id = o.customer_id
JOIN events e ON e.event_id = o.event_id
WHERE o.status = 'PAID'
GROUP BY ROLLUP (c.country, e.genre)
ORDER BY c.country NULLS LAST, e.genre NULLS LAST;

-- Another way
WITH base AS (SELECT c.country, e.genre, i.quantity * i.unit_price AS amt FROM orders o JOIN order_items i USING (order_id) JOIN customers c USING (customer_id) JOIN events e USING (event_id) WHERE o.status = 'PAID')
SELECT country, genre, ROUND(SUM(amt), 2) AS revenue FROM base GROUP BY country, genre
UNION ALL SELECT country, NULL, ROUND(SUM(amt), 2) FROM base GROUP BY country
UNION ALL SELECT NULL, NULL, ROUND(SUM(amt), 2) FROM base
ORDER BY country NULLS LAST, genre NULLS LAST;

-- WHY IT MATTERS: ROLLUP replaces several UNION ALL queries with one pass. If a grouping column
-- can itself be NULL, use `grouping(col)` to tell a real NULL apart from a subtotal row.
