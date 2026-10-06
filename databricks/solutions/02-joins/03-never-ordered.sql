-- Joins · Warm-up · Customers who never ordered
-- Playground: https://aboualyxcode.github.io/select-from-production/#never-ordered
--
-- Growth wants to email customers who signed up but never placed a single order.
--
-- TASK: Return `customer_id` and `full_name` of customers with no orders at all, in any status.
-- Order by `customer_id`.
--
-- Tables: customers, orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT c.customer_id, c.full_name
FROM customers c
LEFT ANTI JOIN orders o ON o.customer_id = c.customer_id
ORDER BY c.customer_id;

-- Another way
SELECT c.customer_id, c.full_name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id) ORDER BY 1;

-- WHY IT MATTERS: `LEFT ANTI JOIN` states the intent directly and never duplicates rows. `NOT
-- EXISTS` is the portable equivalent. Both are safer than `NOT IN (subquery)`, which returns
-- nothing if the subquery contains a single NULL.
