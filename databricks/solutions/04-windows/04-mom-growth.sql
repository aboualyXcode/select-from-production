-- Window functions · Core · Month-over-month growth
-- Playground: https://aboualyxcode.github.io/select-from-production/#mom-growth
--
-- The board deck needs monthly paid revenue and growth versus the previous month.
--
-- TASK: Return `month` (`yyyy-MM`), `revenue`, `prev_revenue` and `growth_pct` = (revenue − prev)
-- / prev × 100 rounded to 1, for PAID orders. Round revenues to 2. The first month has NULL
-- growth. Order by month.
--
-- Tables: orders, order_items

USE SCHEMA stagedoor;

-- Reference solution
WITH m AS (
  SELECT date_format(o.order_ts, 'yyyy-MM') AS month, SUM(i.quantity * i.unit_price) AS revenue
  FROM orders o JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'PAID'
  GROUP BY 1
)
SELECT month,
       ROUND(revenue, 2) AS revenue,
       ROUND(LAG(revenue) OVER (ORDER BY month), 2) AS prev_revenue,
       ROUND((revenue - LAG(revenue) OVER (ORDER BY month)) / LAG(revenue) OVER (ORDER BY month) * 100, 1) AS growth_pct
FROM m
ORDER BY month;

-- Another way
WITH m AS (SELECT date_format(order_ts, 'yyyy-MM') AS month, SUM(quantity * unit_price) AS revenue FROM orders JOIN order_items USING (order_id) WHERE status = 'PAID' GROUP BY 1), l AS (SELECT month, revenue, LAG(revenue) OVER w AS prev FROM m WINDOW w AS (ORDER BY month)) SELECT month, ROUND(revenue, 2) AS revenue, ROUND(prev, 2) AS prev_revenue, ROUND(100 * (revenue / prev - 1), 1) AS growth_pct FROM l ORDER BY month;

-- WHY IT MATTERS: LAG reads the previous row in window order. This assumes every month has sales;
-- if one month were missing, LAG would compare against two months ago. The time series track shows
-- how to zero-fill first.
