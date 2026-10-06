-- Dates and time series · Hard · Sessions from raw clicks
-- Playground: https://aboualyxcode.github.io/select-from-production/#sessionize
--
-- Analytics defines a session as page views by the same logged-in customer on the same device,
-- with no gap longer than 30 minutes.
--
-- TASK: Using only views with a `customer_id`, return per `device`: `sessions`, `views` and
-- `views_per_session` rounded to 2. A gap of exactly 30 minutes stays in the same session. Order
-- by device.
--
-- Tables: page_views

USE SCHEMA stagedoor;

-- Reference solution
WITH flagged AS (
  SELECT customer_id, device, viewed_ts,
         CASE WHEN LAG(viewed_ts) OVER w IS NULL
                OR viewed_ts - LAG(viewed_ts) OVER w > INTERVAL 30 MINUTES
              THEN 1 ELSE 0 END AS new_session
  FROM page_views
  WHERE customer_id IS NOT NULL
  WINDOW w AS (PARTITION BY customer_id, device ORDER BY viewed_ts)
), numbered AS (
  SELECT *, SUM(new_session) OVER (PARTITION BY customer_id, device ORDER BY viewed_ts ROWS UNBOUNDED PRECEDING) AS session_no
  FROM flagged
)
SELECT device,
       COUNT(DISTINCT customer_id, session_no) AS sessions,
       COUNT(*) AS views,
       ROUND(COUNT(*) / COUNT(DISTINCT customer_id, session_no), 2) AS views_per_session
FROM numbered
GROUP BY device
ORDER BY device;

-- Another way
WITH f AS (SELECT customer_id, device, IF(unix_timestamp(viewed_ts) - unix_timestamp(LAG(viewed_ts) OVER (PARTITION BY customer_id, device ORDER BY viewed_ts)) <= 1800, 0, 1) AS new_session FROM page_views WHERE customer_id IS NOT NULL) SELECT device, SUM(new_session) AS sessions, COUNT(*) AS views, ROUND(COUNT(*) / SUM(new_session), 2) AS views_per_session FROM f GROUP BY device ORDER BY device;

-- WHY IT MATTERS: Sessionization is gaps and islands with a time threshold. Counting new-session
-- flags (the alternative) avoids numbering sessions at all. Partitioning matters: leaving the
-- customer out of the PARTITION BY mixes different people's clicks into one stream.
