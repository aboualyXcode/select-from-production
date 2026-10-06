-- Incidents · Hard · The checkout funnel
-- Playground: https://aboualyxcode.github.io/select-from-production/#funnel
--
-- Product wants to know where logged-in visitors drop off between the homepage and the order
-- confirmation.
--
-- TASK: For logged-in views only, return `stage` (home, event, seats, checkout, confirmation, in
-- that order), `visitors` (distinct customers who viewed that page) and `pct_of_previous` = 100 ×
-- visitors / the previous stage's visitors, rounded to 1 (NULL for home).
--
-- Tables: page_views

USE SCHEMA stagedoor;

-- Your SQL here

