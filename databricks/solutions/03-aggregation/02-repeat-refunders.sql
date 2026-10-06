-- Aggregation · Warm-up · Repeat refunders
-- Playground: https://aboualyxcode.github.io/select-from-production/#repeat-refunders
--
-- Risk wants customers with two or more refunded orders.
--
-- TASK: Return `customer_id` and `refunded_orders` for customers with at least 2 REFUNDED orders.
-- Order by refunded_orders descending, then customer_id.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT customer_id, COUNT(*) AS refunded_orders
FROM orders
WHERE status = 'REFUNDED'
GROUP BY customer_id
HAVING COUNT(*) >= 2
ORDER BY refunded_orders DESC, customer_id;

-- Another way
SELECT customer_id, count_if(status = 'REFUNDED') AS refunded_orders FROM orders GROUP BY ALL HAVING refunded_orders >= 2 ORDER BY 2 DESC, 1;

-- WHY IT MATTERS: Databricks lets HAVING and QUALIFY refer to SELECT aliases (`HAVING
-- refunded_orders >= 2`). `count_if(condition)` counts rows where a condition is true, often
-- clearer than `SUM(CASE …)`.
