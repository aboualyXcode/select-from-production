-- Incidents · Hard · Net revenue, properly
-- Playground: https://aboualyxcode.github.io/select-from-production/#net-revenue
--
-- The monthly net revenue chart counts failed attempts and duplicate charges, books refunds in the
-- wrong month, and shows NULL for months without refunds. The query is in the editor.
--
-- TASK: Return `month` (`yyyy-MM`), `gross`, `refunds` and `net`, all rounded to 2. gross: SETTLED
-- payments, counting only each order's earliest settled charge, in the month of that charge.
-- refunds: refunds in the month of refund_ts, excluding refunds for orders that don't exist. net =
-- gross − refunds, treating a missing side as 0. Include every month with either. Order by month.
--
-- Tables: payments, refunds, orders

USE SCHEMA stagedoor;

-- The query you were handed:
SELECT date_format(p.paid_ts, 'yyyy-MM') AS month,
       ROUND(SUM(p.amount), 2) AS gross,
       ROUND(SUM(r.amount), 2) AS refunds,
       ROUND(SUM(p.amount) - SUM(r.amount), 2) AS net
FROM payments p
LEFT JOIN refunds r ON r.order_id = p.order_id
GROUP BY 1
ORDER BY 1;

