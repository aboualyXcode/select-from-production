-- Aggregation · Warm-up · Revenue by genre
-- Playground: https://aboualyxcode.github.io/select-from-production/#genre-revenue
--
-- The programming team decides which genres to book more of.
--
-- TASK: For PAID orders, return `genre`, `orders` (number of distinct orders), `tickets` (sum of
-- quantity) and `revenue` (sum of quantity × unit_price, rounded to 2). Order by revenue
-- descending.
--
-- Tables: orders, order_items, events

USE SCHEMA stagedoor;

-- Reference solution
SELECT e.genre,
       COUNT(DISTINCT o.order_id) AS orders,
       SUM(i.quantity) AS tickets,
       ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
JOIN events e ON e.event_id = o.event_id
WHERE o.status = 'PAID'
GROUP BY ALL
ORDER BY revenue DESC;

-- Another way
SELECT genre, COUNT(DISTINCT order_id) AS orders, SUM(quantity) AS tickets, ROUND(SUM(quantity * unit_price), 2) AS revenue FROM orders JOIN order_items USING (order_id) JOIN events USING (event_id) WHERE status = 'PAID' GROUP BY genre ORDER BY 4 DESC;

-- WHY IT MATTERS: `GROUP BY ALL` is a Databricks convenience: it groups by every SELECT expression
-- that is not an aggregate, so the grouping can never drift out of sync with the columns. Know
-- your grain: after joining lines, `COUNT(*)` counts lines.
