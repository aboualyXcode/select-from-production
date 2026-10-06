-- Dates and time series · Hard · Do new customers buy within 30 days?
-- Playground: https://aboualyxcode.github.io/select-from-production/#cohort-conversion
--
-- Growth measures how quickly each monthly sign-up cohort converts.
--
-- TASK: For customers who signed up in 2025, return `cohort_month` (`yyyy-MM` of signup_date),
-- `customers`, `converted_30d` (customers with a PAID order placed 0–30 days after signing up, by
-- datediff) and `pct_30d` rounded to 1. Order by cohort_month.
--
-- Tables: customers, orders

USE SCHEMA stagedoor;

-- Reference solution
WITH per_customer AS (
  SELECT c.customer_id,
         date_format(c.signup_date, 'yyyy-MM') AS cohort_month,
         MAX(IF(o.order_id IS NOT NULL, 1, 0)) AS converted
  FROM customers c
  LEFT JOIN orders o
    ON o.customer_id = c.customer_id
   AND o.status = 'PAID'
   AND datediff(o.order_ts, c.signup_date) BETWEEN 0 AND 30
  WHERE year(c.signup_date) = 2025
  GROUP BY ALL
)
SELECT cohort_month,
       COUNT(*) AS customers,
       SUM(converted) AS converted_30d,
       ROUND(100 * SUM(converted) / COUNT(*), 1) AS pct_30d
FROM per_customer
GROUP BY cohort_month
ORDER BY cohort_month;

-- Another way
SELECT date_format(c.signup_date, 'yyyy-MM') AS cohort_month, COUNT(*) AS customers, count_if(EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id AND o.status = 'PAID' AND datediff(o.order_ts, c.signup_date) BETWEEN 0 AND 30)) AS converted_30d, ROUND(100 * count_if(EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id AND o.status = 'PAID' AND datediff(o.order_ts, c.signup_date) BETWEEN 0 AND 30)) / COUNT(*), 1) AS pct_30d FROM customers c WHERE year(c.signup_date) = 2025 GROUP BY 1 ORDER BY 1;

-- WHY IT MATTERS: Cohort metrics need the full denominator: customers who never converted must
-- stay in the count. Reducing to one row per customer before aggregating keeps the grain obvious
-- and prevents double counting customers with several qualifying orders.
