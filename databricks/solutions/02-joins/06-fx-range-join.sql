-- Joins · Core · Convert PayPal payments to USD
-- Playground: https://aboualyxcode.github.io/select-from-production/#fx-range-join
--
-- PayPal settles Stagedoor's payments in EUR. Finance reports in USD, using the exchange rate
-- valid on the day of the payment.
--
-- TASK: For payments with `method = 'paypal'`, return `payment_id`, `amount` and `usd_amount`
-- (amount × the EUR rate valid on the payment date, rounded to 2 decimals). A rate is valid from
-- `valid_from` to `valid_to`, both inclusive. Order by `payment_id`.
--
-- Tables: payments, fx_rates

USE SCHEMA stagedoor;

-- Reference solution
SELECT p.payment_id, p.amount, ROUND(p.amount * f.usd_rate, 2) AS usd_amount
FROM payments p
JOIN fx_rates f
  ON f.currency = 'EUR'
 AND CAST(p.paid_ts AS DATE) BETWEEN f.valid_from AND f.valid_to
WHERE p.method = 'paypal'
ORDER BY p.payment_id;

-- Another way
SELECT p.payment_id, p.amount, ROUND(p.amount * (SELECT usd_rate FROM fx_rates f WHERE f.currency = 'EUR' AND to_date(p.paid_ts) >= f.valid_from AND to_date(p.paid_ts) <= f.valid_to), 2) AS usd_amount FROM payments p WHERE p.method = 'paypal' ORDER BY 1;

-- WHY IT MATTERS: Range joins are common in finance and SCD lookups. Be precise about inclusive
-- and exclusive bounds: comparing a timestamp such as `2025-06-30 14:00` with a date `valid_to =
-- 2025-06-30` treats the date as midnight and drops the last day.
