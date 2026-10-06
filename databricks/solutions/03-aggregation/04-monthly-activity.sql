-- Aggregation · Core · Monthly activity
-- Playground: https://aboualyxcode.github.io/select-from-production/#monthly-activity
--
-- Product wants to know whether customers order more often, or whether there are simply more
-- customers.
--
-- TASK: Per month of `order_ts` (formatted `yyyy-MM` as `month`), return `orders`, `customers`
-- (distinct) and `orders_per_customer` rounded to 2. All statuses count. Order by month.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT date_format(order_ts, 'yyyy-MM') AS month,
       COUNT(*) AS orders,
       COUNT(DISTINCT customer_id) AS customers,
       ROUND(COUNT(*) / COUNT(DISTINCT customer_id), 2) AS orders_per_customer
FROM orders
GROUP BY 1
ORDER BY 1;

-- Another way
SELECT month, COUNT(*) AS orders, COUNT(DISTINCT customer_id) AS customers, ROUND(COUNT(*) / COUNT(DISTINCT customer_id), 2) AS orders_per_customer FROM (SELECT date_format(date_trunc('MONTH', order_ts), 'yyyy-MM') AS month, customer_id FROM orders) GROUP BY ALL ORDER BY month;

-- WHY IT MATTERS: Ratios of distinct counts cannot be added across months: a customer active in
-- two months is counted once per month. That is why such metrics are recomputed per period, never
-- summed.
