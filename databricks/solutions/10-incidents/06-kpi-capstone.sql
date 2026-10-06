-- Incidents · Hard · Capstone: the monthly KPI table
-- Playground: https://aboualyxcode.github.io/select-from-production/#kpi-capstone
--
-- The exec team gets one table per month. Build it for the first half of 2026 (orders placed
-- January to June).
--
-- TASK: Per `month` (`yyyy-MM` of order_ts): `paid_orders`; `tickets` (PAID); `gross_bookings`
-- (PAID line totals, rounded to 2); `active_customers` (distinct customers with a PAID order);
-- `avg_tickets_per_order` (PAID, rounded to 2); `refund_rate_pct` = REFUNDED orders / (PAID +
-- REFUNDED orders) × 100, rounded to 1. Order by month.
--
-- Tables: orders, order_items

USE SCHEMA stagedoor;

-- Reference solution
WITH lines AS (
  SELECT order_id, SUM(quantity) AS tickets, SUM(quantity * unit_price) AS amount
  FROM order_items
  GROUP BY order_id
)
SELECT date_format(o.order_ts, 'yyyy-MM') AS month,
       count_if(o.status = 'PAID') AS paid_orders,
       SUM(l.tickets) FILTER (WHERE o.status = 'PAID') AS tickets,
       ROUND(SUM(l.amount) FILTER (WHERE o.status = 'PAID'), 2) AS gross_bookings,
       COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status = 'PAID') AS active_customers,
       ROUND(AVG(l.tickets) FILTER (WHERE o.status = 'PAID'), 2) AS avg_tickets_per_order,
       ROUND(100 * count_if(o.status = 'REFUNDED') / count_if(o.status IN ('PAID', 'REFUNDED')), 1) AS refund_rate_pct
FROM orders o
JOIN lines l ON l.order_id = o.order_id
WHERE o.order_ts >= '2026-01-01' AND o.order_ts < '2026-07-01'
GROUP BY 1
ORDER BY 1;

-- Another way
WITH o AS (SELECT order_id, customer_id, status, date_format(order_ts, 'yyyy-MM') AS month FROM orders WHERE year(order_ts) = 2026 AND month(order_ts) <= 6), paid AS (SELECT o.month, o.order_id, o.customer_id, SUM(i.quantity) AS tickets, SUM(i.quantity * i.unit_price) AS amount FROM o JOIN order_items i USING (order_id) WHERE o.status = 'PAID' GROUP BY ALL), p AS (SELECT month, COUNT(*) AS paid_orders, SUM(tickets) AS tickets, ROUND(SUM(amount), 2) AS gross_bookings, COUNT(DISTINCT customer_id) AS active_customers, ROUND(AVG(tickets), 2) AS avg_tickets_per_order FROM paid GROUP BY month), r AS (SELECT month, ROUND(100 * count_if(status = 'REFUNDED') / count_if(status IN ('PAID', 'REFUNDED')), 1) AS refund_rate_pct FROM o GROUP BY month) SELECT p.*, r.refund_rate_pct FROM p JOIN r USING (month) ORDER BY month;

-- WHY IT MATTERS: A KPI table is several metrics that must share one grain and one set of
-- definitions. Pre-aggregating children to the parent's grain, then using FILTER per metric, keeps
-- it to a single pass. On Databricks, publishing the definitions as a metric view keeps every
-- dashboard consistent.
