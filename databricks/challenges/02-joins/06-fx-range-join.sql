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

-- Your SQL here

