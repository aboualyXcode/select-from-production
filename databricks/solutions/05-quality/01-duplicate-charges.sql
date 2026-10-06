-- Data quality · Core · Customers charged twice
-- Playground: https://aboualyxcode.github.io/select-from-production/#duplicate-charges
--
-- A payment-gateway retry bug charged some customers twice. Finance needs the list to issue
-- refunds.
--
-- TASK: For orders with more than one SETTLED payment, return `order_id`, `charges`,
-- `total_charged` and `overcharge` (total minus a single charge), amounts rounded to 2. Order by
-- order_id.
--
-- Tables: payments

USE SCHEMA stagedoor;

-- Reference solution
SELECT order_id,
       COUNT(*) AS charges,
       ROUND(SUM(amount), 2) AS total_charged,
       ROUND(SUM(amount) - MIN(amount), 2) AS overcharge
FROM payments
WHERE status = 'SETTLED'
GROUP BY order_id
HAVING COUNT(*) > 1
ORDER BY order_id;

-- Another way
SELECT order_id, COUNT(*) AS charges, ROUND(SUM(amount), 2) AS total_charged, ROUND(SUM(amount) - MIN(amount), 2) AS overcharge FROM payments WHERE status = 'SETTLED' GROUP BY ALL QUALIFY COUNT(*) > 1 ORDER BY 1;

-- WHY IT MATTERS: Failed payment attempts are not charges, which is why the status filter matters.
-- Writing this check as a scheduled query with an alert turns a support incident into a dashboard
-- tile.
