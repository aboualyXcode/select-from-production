-- Window functions · Warm-up · Latest order per customer
-- Playground: https://aboualyxcode.github.io/select-from-production/#latest-order
--
-- Support wants each customer's most recent order on their screen.
--
-- TASK: Return `customer_id`, `order_id`, `order_ts` and `status` of each customer's most recent
-- order. Order by customer_id.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT customer_id, order_id, order_ts, status
FROM orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_ts DESC, order_id DESC) = 1
ORDER BY customer_id;

-- Another way
SELECT o.customer_id, o.order_id, o.order_ts, o.status FROM orders o WHERE o.order_ts = (SELECT MAX(i.order_ts) FROM orders i WHERE i.customer_id = o.customer_id) ORDER BY 1;

-- WHY IT MATTERS: Latest-row-per-key is the most common deduplication pattern in pipelines. On
-- Databricks, `QUALIFY ROW_NUMBER() … = 1` is the idiom: one pass, no self join.
