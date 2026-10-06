-- Aggregation · Core · Channel scorecard
-- Playground: https://aboualyxcode.github.io/select-from-production/#channel-scorecard
--
-- The weekly business review compares channels on one row each.
--
-- TASK: Per `channel`, return `orders`, `paid`, `cancelled`, `refunded` (counts by status) and
-- `paid_rate` = paid / orders, rounded to 3. Order by channel.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT channel,
       COUNT(*) AS orders,
       COUNT(*) FILTER (WHERE status = 'PAID') AS paid,
       COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
       COUNT(*) FILTER (WHERE status = 'REFUNDED') AS refunded,
       ROUND(COUNT(*) FILTER (WHERE status = 'PAID') / COUNT(*), 3) AS paid_rate
FROM orders
GROUP BY channel
ORDER BY channel;

-- Another way
SELECT channel, COUNT(*) AS orders, count_if(status = 'PAID') AS paid, count_if(status = 'CANCELLED') AS cancelled, count_if(status = 'REFUNDED') AS refunded, ROUND(AVG(IF(status = 'PAID', 1, 0)), 3) AS paid_rate FROM orders GROUP BY ALL ORDER BY 1;

-- WHY IT MATTERS: Conditional aggregation pivots values into columns in a single pass.
-- `AVG(IF(cond, 1, 0))` is a neat way to compute a rate directly.
