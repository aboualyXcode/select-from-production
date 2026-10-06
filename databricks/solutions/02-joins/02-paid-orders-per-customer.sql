-- Joins · Core · Paid orders per customer, zeros included
-- Playground: https://aboualyxcode.github.io/select-from-production/#paid-orders-per-customer
--
-- The CRM team wants every customer with their number of paid orders, so they can target customers
-- with none.
--
-- TASK: Return every customer's `customer_id` and `paid_orders`, including customers with 0. Order
-- by `customer_id`.
--
-- Tables: customers, orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT c.customer_id, COUNT(o.order_id) AS paid_orders
FROM customers c
LEFT JOIN orders o
  ON o.customer_id = c.customer_id
 AND o.status = 'PAID'
GROUP BY c.customer_id
ORDER BY c.customer_id;

-- Another way
SELECT c.customer_id, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.customer_id AND o.status = 'PAID') AS paid_orders FROM customers c ORDER BY 1;

-- WHY IT MATTERS: Three classic bugs in one task. A filter on the right-hand table in `WHERE`
-- discards the NULL rows a LEFT JOIN added, silently turning it into an inner join. `COUNT(*)`
-- counts those NULL rows as 1. Put right-hand filters in `ON`, and count a right-hand column.
