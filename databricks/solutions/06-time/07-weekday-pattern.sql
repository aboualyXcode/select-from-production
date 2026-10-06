-- Dates and time series · Warm-up · Which weekday sells best?
-- Playground: https://aboualyxcode.github.io/select-from-production/#weekday-pattern
--
-- Marketing schedules campaigns on the days customers buy most.
--
-- TASK: Return `day_name` (Monday, Tuesday, …) and `paid_orders`, ordered Monday to Sunday.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT date_format(order_ts, 'EEEE') AS day_name, COUNT(*) AS paid_orders
FROM orders
WHERE status = 'PAID'
GROUP BY date_format(order_ts, 'EEEE'), weekday(order_ts)
ORDER BY weekday(order_ts);

-- Another way
SELECT day_name, paid_orders FROM (SELECT date_format(order_ts, 'EEEE') AS day_name, (dayofweek(order_ts) + 5) % 7 AS dow, COUNT(*) AS paid_orders FROM orders WHERE status = 'PAID' GROUP BY ALL) ORDER BY dow;

-- WHY IT MATTERS: Sorting by a label sorts alphabetically (Friday first). Keep a numeric key
-- beside the label for ordering. `dayofweek` starts at Sunday = 1; `weekday` starts at Monday = 0.
