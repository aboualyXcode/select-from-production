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

-- Reference solution
SELECT c.customer_id, c.signup_date, c.referred_by, r.signup_date AS referrer_signup
FROM customers c
JOIN customers r ON r.customer_id = c.referred_by
WHERE r.signup_date > c.signup_date
ORDER BY c.customer_id;

-- Another way
SELECT customer_id, signup_date, referred_by, referrer_signup FROM (SELECT c.*, (SELECT r.signup_date FROM customers r WHERE r.customer_id = c.referred_by) AS referrer_signup FROM customers c) WHERE referrer_signup > signup_date ORDER BY 1;

-- WHY IT MATTERS: Cross-row consistency rules like this are invisible to column-level checks (NOT
-- NULL, ranges). They are worth encoding as tests because they catch broken imports.
