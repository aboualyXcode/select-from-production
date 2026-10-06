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

-- Reference solution
WITH stages AS (
  SELECT * FROM VALUES (1, 'home'), (2, 'event'), (3, 'seats'), (4, 'checkout'), (5, 'confirmation') AS s(step, page)
), v AS (
  SELECT s.step, s.page, COUNT(DISTINCT p.customer_id) AS visitors
  FROM stages s
  LEFT JOIN page_views p ON p.page = s.page AND p.customer_id IS NOT NULL
  GROUP BY s.step, s.page
)
SELECT page AS stage, visitors,
       ROUND(100 * visitors / LAG(visitors) OVER (ORDER BY step), 1) AS pct_of_previous
FROM v
ORDER BY step;

-- Another way
WITH v AS (SELECT page, array_position(array('home', 'event', 'seats', 'checkout', 'confirmation'), page) AS step, COUNT(DISTINCT customer_id) AS visitors FROM page_views WHERE customer_id IS NOT NULL AND page IN ('home', 'event', 'seats', 'checkout', 'confirmation') GROUP BY page) SELECT page AS stage, visitors, ROUND(100 * visitors / LAG(visitors) OVER (ORDER BY step), 1) AS pct_of_previous FROM v ORDER BY step;

-- WHY IT MATTERS: This is a simple, page-based funnel. A strict funnel also requires the steps in
-- order within a session. That combines this challenge with sessionization: number each customer's
-- views and check that each step happened after the previous one.
