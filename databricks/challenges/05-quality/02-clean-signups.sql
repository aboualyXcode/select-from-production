-- Data quality · Hard · Clean the raw sign-ups
-- Playground: https://aboualyxcode.github.io/select-from-production/#clean-signups
--
-- The sign-up form wrote raw text: stray spaces, mixed case, invalid emails and the same person
-- twice.
--
-- TASK: Return `signup_id`, `email` (trimmed, lower case), `full_name` (initcap, with runs of
-- spaces collapsed to one) and `country` (trimmed, upper case). Keep only valid emails, matching
-- `^[^@ ]+@[^@ ]+[.][a-z]+$` after cleaning, and keep one row per email: the lowest signup_id.
-- Order by signup_id.
--
-- Tables: raw_signups

USE SCHEMA stagedoor;

-- Your SQL here

