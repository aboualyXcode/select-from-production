-- Aggregation · Core · Each customer's latest channel
-- Playground: https://aboualyxcode.github.io/select-from-production/#last-channel
--
-- CRM personalises messages by the channel a customer used most recently.
--
-- TASK: For each customer with orders, return `customer_id`, `last_order_ts` and `last_channel`
-- (the channel of their most recent order). Order by customer_id.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT customer_id,
       MAX(order_ts) AS last_order_ts,
       max_by(channel, order_ts) AS last_channel
FROM orders
GROUP BY customer_id
ORDER BY customer_id;

-- Another way
SELECT customer_id, order_ts AS last_order_ts, channel AS last_channel FROM orders QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_ts DESC) = 1 ORDER BY customer_id;

-- WHY IT MATTERS: `MAX(channel)` returns the alphabetically largest channel, not the latest one.
-- `max_by` and `min_by` pick a value by another column, avoiding a self join or a window.
