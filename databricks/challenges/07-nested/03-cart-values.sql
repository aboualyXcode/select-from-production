-- Semi-structured data · Core · Cart values
-- Playground: https://aboualyxcode.github.io/select-from-production/#cart-values
--
-- Abandoned-cart emails need each cart's number of lines and total value. Some carts are empty.
--
-- TASK: Return `cart_id`, `lines` (items in the cart) and `value` (sum of qty × unit_price,
-- rounded to 2), with 0 for empty carts. Order by cart_id.
--
-- Tables: carts

USE SCHEMA stagedoor;

-- Your SQL here

