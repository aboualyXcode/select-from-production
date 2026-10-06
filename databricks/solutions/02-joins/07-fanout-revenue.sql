-- Joins · Core · Revenue per event is too high
-- Playground: https://aboualyxcode.github.io/select-from-production/#fanout-revenue
--
-- A dashboard shows gross ticket revenue per event that is noticeably higher than finance's
-- numbers. The query is in the editor.
--
-- TASK: Fix it. Return `event_id` and `revenue`: the sum of `quantity × unit_price` over the order
-- lines of PAID orders, rounded to 2 decimals. Order by `event_id`.
--
-- Tables: orders, order_items, payments

USE SCHEMA stagedoor;

-- Reference solution
SELECT o.event_id,
       ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
WHERE o.status = 'PAID'
GROUP BY o.event_id
ORDER BY o.event_id;

-- Another way
SELECT event_id, ROUND(SUM(line_total), 2) AS revenue FROM (SELECT o.event_id, i.quantity * i.unit_price AS line_total FROM orders o JOIN order_items i USING (order_id) WHERE o.status = 'PAID') GROUP BY ALL ORDER BY 1;

-- WHY IT MATTERS: This is join fan-out: joining two child tables (lines and payments) of the same
-- parent multiplies their rows. Some orders were charged twice, so their lines were counted twice.
-- Aggregate each child separately, or join only what the measure needs.
