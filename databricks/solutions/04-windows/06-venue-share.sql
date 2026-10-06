-- Window functions · Core · Share of tickets by venue
-- Playground: https://aboualyxcode.github.io/select-from-production/#venue-share
--
-- Partnerships negotiates with venues using their share of all paid tickets.
--
-- TASK: Return the venue `name`, `tickets` (paid) and `share_pct` = 100 × tickets / all paid
-- tickets, rounded to 1. Order by share_pct descending, then name.
--
-- Tables: orders, order_items, events, venues

USE SCHEMA stagedoor;

-- Reference solution
SELECT v.name, SUM(i.quantity) AS tickets,
       ROUND(100 * SUM(i.quantity) / SUM(SUM(i.quantity)) OVER (), 1) AS share_pct
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
JOIN events e ON e.event_id = o.event_id
JOIN venues v ON v.venue_id = e.venue_id
WHERE o.status = 'PAID'
GROUP BY v.name
ORDER BY share_pct DESC, v.name;

-- Another way
WITH t AS (SELECT v.name, SUM(i.quantity) AS tickets FROM orders o JOIN order_items i USING (order_id) JOIN events e USING (event_id) JOIN venues v ON v.venue_id = e.venue_id WHERE o.status = 'PAID' GROUP BY ALL) SELECT name, tickets, ROUND(100 * tickets / (SELECT SUM(tickets) FROM t), 1) AS share_pct FROM t ORDER BY 3 DESC, 1;

-- WHY IT MATTERS: An empty `OVER ()` is the whole result set, computed after grouping. Shares
-- rounded independently may not add up to exactly 100; that is expected.
