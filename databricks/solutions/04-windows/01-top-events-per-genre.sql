-- Window functions · Core · Top 2 events per genre
-- Playground: https://aboualyxcode.github.io/select-from-production/#top-events-per-genre
--
-- The homepage shows the two best-selling concerts in each genre.
--
-- TASK: For PAID orders, return `genre`, `event_id`, `tickets` (sum of quantity) and `rank` (1 or
-- 2) for the top 2 events per genre by tickets. Break ties by the lower event_id. Order by genre,
-- then rank.
--
-- Tables: orders, order_items, events

USE SCHEMA stagedoor;

-- Reference solution
SELECT e.genre, o.event_id, SUM(i.quantity) AS tickets,
       ROW_NUMBER() OVER (PARTITION BY e.genre ORDER BY SUM(i.quantity) DESC, o.event_id) AS rank
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
JOIN events e ON e.event_id = o.event_id
WHERE o.status = 'PAID'
GROUP BY e.genre, o.event_id
QUALIFY rank <= 2
ORDER BY e.genre, rank;

-- Another way
WITH t AS (SELECT genre, event_id, SUM(quantity) AS tickets FROM orders JOIN order_items USING (order_id) JOIN events USING (event_id) WHERE status = 'PAID' GROUP BY ALL), r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY genre ORDER BY tickets DESC, event_id) AS rank FROM t) SELECT * FROM r WHERE rank <= 2 ORDER BY genre, rank;

-- WHY IT MATTERS: `QUALIFY` is to window functions what HAVING is to aggregates. Always give a
-- ranking a deterministic tie-breaker, or the "top 2" can change between runs.
