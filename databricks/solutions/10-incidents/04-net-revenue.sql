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

-- Reference solution
WITH charges AS (
  SELECT date_format(paid_ts, 'yyyy-MM') AS month, amount
  FROM payments
  WHERE status = 'SETTLED'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY paid_ts, payment_id) = 1
), g AS (
  SELECT month, SUM(amount) AS gross FROM charges GROUP BY month
), rf AS (
  SELECT date_format(r.refund_ts, 'yyyy-MM') AS month, SUM(r.amount) AS refunds
  FROM refunds r
  LEFT SEMI JOIN orders o ON o.order_id = r.order_id
  GROUP BY 1
)
SELECT coalesce(g.month, rf.month) AS month,
       ROUND(coalesce(g.gross, 0), 2) AS gross,
       ROUND(coalesce(rf.refunds, 0), 2) AS refunds,
       ROUND(coalesce(g.gross, 0) - coalesce(rf.refunds, 0), 2) AS net
FROM g
FULL OUTER JOIN rf ON rf.month = g.month
ORDER BY 1;

-- Another way
WITH movements AS (SELECT date_format(paid_ts, 'yyyy-MM') AS month, amount AS gross, 0 AS refund FROM payments WHERE status = 'SETTLED' QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY paid_ts, payment_id) = 1 UNION ALL SELECT date_format(refund_ts, 'yyyy-MM'), 0, amount FROM refunds WHERE order_id IN (SELECT order_id FROM orders)) SELECT month, ROUND(SUM(gross), 2) AS gross, ROUND(SUM(refund), 2) AS refunds, ROUND(SUM(gross) - SUM(refund), 2) AS net FROM movements GROUP BY month ORDER BY month;

-- WHY IT MATTERS: Most broken finance queries combine several facts at different grains and dates
-- in one join. Aggregate each fact at its own grain and date first, then combine the summaries,
-- with a FULL OUTER JOIN or a UNION ALL of signed movements as in the alternative.
