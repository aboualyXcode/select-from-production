-- Data quality · Core · Impossible referrals
-- Playground: https://aboualyxcode.github.io/select-from-production/#referral-timing
--
-- A customer cannot be referred by someone who signed up after them. Data engineering suspects the
-- referral import.
--
-- TASK: Return `customer_id`, `signup_date`, `referred_by` and `referrer_signup` for customers
-- whose referrer signed up after them. Order by customer_id.
--
-- Tables: customers

USE SCHEMA stagedoor;

-- Your SQL here

