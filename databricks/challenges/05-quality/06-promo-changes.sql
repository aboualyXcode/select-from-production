-- Data quality · Hard · Did the promo code change?
-- Playground: https://aboualyxcode.github.io/select-from-production/#promo-changes
--
-- Marketing wants to know how often a customer's order uses a different promo code than their
-- previous order. NULL means "no code", and going from no code to a code counts as a change.
--
-- TASK: Return one column, `changes`: the number of orders whose promo_code differs from the same
-- customer's previous order (by order_ts), comparing NULLs safely. A customer's first order is not
-- a change.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Your SQL here

