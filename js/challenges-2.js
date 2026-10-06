/* challenges-2.js: tracks 6–10. State challenges (pipelines) run your statements against a prepared
   setup, then compare the resulting table; those marked idempotent must also be safe to run twice. */
(function (root) {
  'use strict';
  const X = root.SQLX = root.SQLX || {};
  X.CHALLENGES = X.CHALLENGES || [];
  const add = (track, list) => list.forEach(c => X.CHALLENGES.push(Object.assign({ track, mode: 'query', ordered: false, hints: [], traps: [] }, c)));

  /* ===================== 6. Dates and time series ===================== */
  add('time', [
    {
      id: 'zero-fill-days', level: 2, title: 'Tickets per day, including quiet days',
      scenario: 'The support dashboard\'s daily chart skips days with no tickets, which makes quiet days invisible.',
      task: 'Return every <code>day</code> from 2026-01-01 to 2026-01-14 (inclusive) and <code>tickets</code>: support tickets opened that day, <b>0</b> for days with none. Order by day.',
      tables: ['support_tickets'], ordered: true,
      hints: ["sequence(DATE'2026-01-01', DATE'2026-01-14') builds an array of dates; explode() turns it into rows.", 'LEFT JOIN the tickets to the calendar and count a ticket column.'],
      solution: `WITH days AS (
  SELECT explode(sequence(DATE'2026-01-01', DATE'2026-01-14')) AS day
)
SELECT d.day, COUNT(t.ticket_id) AS tickets
FROM days d
LEFT JOIN support_tickets t ON CAST(t.opened_ts AS DATE) = d.day
GROUP BY d.day
ORDER BY d.day`,
      alt: `SELECT date_add(DATE'2026-01-01', id) AS day, (SELECT COUNT(*) FROM support_tickets t WHERE to_date(t.opened_ts) = date_add(DATE'2026-01-01', id)) AS tickets FROM range(14) ORDER BY 1`,
      traps: [`SELECT CAST(opened_ts AS DATE) AS day, COUNT(*) AS tickets FROM support_tickets WHERE opened_ts >= '2026-01-01' AND opened_ts < '2026-01-15' GROUP BY 1 ORDER BY 1`],
      explain: 'Aggregates only produce rows for values that exist. A calendar (a date dimension, or <code>sequence</code> + <code>explode</code>) is how time series get explicit zeros, and LAG-based comparisons only work once every period is present.',
    },
    {
      id: 'missing-snapshots', level: 3, title: 'Which snapshot days are missing?',
      scenario: 'The seat-inventory job failed on some days. Operations needs the exact dates to backfill.',
      task: 'For each event in <code>seat_inventory</code>, find the dates between its first and last snapshot that have no snapshot. Return <code>event_id</code> and <code>missing_date</code>, ordered by both.',
      tables: ['seat_inventory'], ordered: true,
      hints: ['Build the expected dates per event with sequence(first_day, last_day), explode them, and anti join the actual snapshots.'],
      solution: `WITH bounds AS (
  SELECT event_id, MIN(snapshot_date) AS first_day, MAX(snapshot_date) AS last_day
  FROM seat_inventory
  GROUP BY event_id
), expected AS (
  SELECT event_id, explode(sequence(first_day, last_day)) AS day
  FROM bounds
)
SELECT e.event_id, e.day AS missing_date
FROM expected e
LEFT ANTI JOIN seat_inventory s ON s.event_id = e.event_id AND s.snapshot_date = e.day
ORDER BY 1, 2`,
      alt: `SELECT event_id, explode(sequence(date_add(snapshot_date, 1), date_sub(next_day, 1))) AS missing_date FROM (SELECT event_id, snapshot_date, LEAD(snapshot_date) OVER (PARTITION BY event_id ORDER BY snapshot_date) AS next_day FROM seat_inventory) WHERE datediff(next_day, snapshot_date) > 1 ORDER BY 1, 2`,
      explain: 'Gap detection is a production staple: missing partitions, missed heartbeats, failed snapshots. Generating what <i>should</i> exist and anti-joining what <i>does</i> is the general pattern.',
    },
    {
      id: 'snapshot-islands', level: 3, title: 'Unbroken snapshot runs',
      scenario: 'Forecasting only trusts unbroken runs of daily snapshots.',
      task: 'For each event, return each run of consecutive snapshot days: <code>event_id</code>, <code>run_start</code>, <code>run_end</code> and <code>days</code>. Order by event_id, run_start.',
      tables: ['seat_inventory'], ordered: true,
      hints: ['Consecutive dates minus their row number give the same value: date_sub(snapshot_date, ROW_NUMBER() OVER (…)).', 'Group by event and that value.'],
      solution: `WITH g AS (
  SELECT event_id, snapshot_date,
         date_sub(snapshot_date, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY snapshot_date)) AS grp
  FROM seat_inventory
)
SELECT event_id, MIN(snapshot_date) AS run_start, MAX(snapshot_date) AS run_end, COUNT(*) AS days
FROM g
GROUP BY event_id, grp
ORDER BY event_id, run_start`,
      alt: `WITH f AS (SELECT event_id, snapshot_date, IF(datediff(snapshot_date, LAG(snapshot_date) OVER (PARTITION BY event_id ORDER BY snapshot_date)) = 1, 0, 1) AS new_run FROM seat_inventory), r AS (SELECT *, SUM(new_run) OVER (PARTITION BY event_id ORDER BY snapshot_date ROWS UNBOUNDED PRECEDING) AS run_no FROM f) SELECT event_id, MIN(snapshot_date) AS run_start, MAX(snapshot_date) AS run_end, COUNT(*) AS days FROM r GROUP BY event_id, run_no ORDER BY 1, 2`,
      explain: 'This is the "gaps and islands" pattern. The row-number trick works for strictly consecutive values; the flag-and-running-sum version (see the alternative) generalizes to any rule for "a new group starts here", such as session timeouts.',
    },
    {
      id: 'sessionize', level: 3, title: 'Sessions from raw clicks',
      scenario: 'Analytics defines a session as page views by the same logged-in customer on the same device, with no gap longer than 30 minutes.',
      task: 'Using only views with a <code>customer_id</code>, return per <code>device</code>: <code>sessions</code>, <code>views</code> and <code>views_per_session</code> rounded to 2. A gap of exactly 30 minutes stays in the same session. Order by device.',
      tables: ['page_views'], ordered: true,
      hints: ['Flag a view as a new session when the previous view (same customer and device) is missing or more than 30 minutes earlier.', 'A running SUM of the flag numbers the sessions.', 'Count sessions as distinct (customer, session number) pairs.'],
      solution: `WITH flagged AS (
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
ORDER BY device`,
      alt: `WITH f AS (SELECT customer_id, device, IF(unix_timestamp(viewed_ts) - unix_timestamp(LAG(viewed_ts) OVER (PARTITION BY customer_id, device ORDER BY viewed_ts)) <= 1800, 0, 1) AS new_session FROM page_views WHERE customer_id IS NOT NULL) SELECT device, SUM(new_session) AS sessions, COUNT(*) AS views, ROUND(COUNT(*) / SUM(new_session), 2) AS views_per_session FROM f GROUP BY device ORDER BY device`,
      traps: [`WITH f AS (SELECT customer_id, device, IF(unix_timestamp(viewed_ts) - unix_timestamp(LAG(viewed_ts) OVER (PARTITION BY device ORDER BY viewed_ts)) <= 1800, 0, 1) AS new_session FROM page_views WHERE customer_id IS NOT NULL) SELECT device, SUM(new_session) AS sessions, COUNT(*) AS views, ROUND(COUNT(*) / SUM(new_session), 2) AS views_per_session FROM f GROUP BY device ORDER BY device`],
      explain: 'Sessionization is gaps and islands with a time threshold. Counting new-session flags (the alternative) avoids numbering sessions at all. Partitioning matters: leaving the customer out of the PARTITION BY mixes different people\'s clicks into one stream.',
    },
    {
      id: 'cohort-conversion', level: 3, title: 'Do new customers buy within 30 days?',
      scenario: 'Growth measures how quickly each monthly sign-up cohort converts.',
      task: 'For customers who signed up in 2025, return <code>cohort_month</code> (<code>yyyy-MM</code> of signup_date), <code>customers</code>, <code>converted_30d</code> (customers with a PAID order placed 0–30 days after signing up, by datediff) and <code>pct_30d</code> rounded to 1. Order by cohort_month.',
      tables: ['customers', 'orders'], ordered: true,
      hints: ['One row per customer first: did they convert (1/0)? Then aggregate per cohort.', 'Keep customers without orders: LEFT JOIN, with the conditions in ON.'],
      solution: `WITH per_customer AS (
  SELECT c.customer_id,
         date_format(c.signup_date, 'yyyy-MM') AS cohort_month,
         MAX(IF(o.order_id IS NOT NULL, 1, 0)) AS converted
  FROM customers c
  LEFT JOIN orders o
    ON o.customer_id = c.customer_id
   AND o.status = 'PAID'
   AND datediff(o.order_ts, c.signup_date) BETWEEN 0 AND 30
  WHERE year(c.signup_date) = 2025
  GROUP BY ALL
)
SELECT cohort_month,
       COUNT(*) AS customers,
       SUM(converted) AS converted_30d,
       ROUND(100 * SUM(converted) / COUNT(*), 1) AS pct_30d
FROM per_customer
GROUP BY cohort_month
ORDER BY cohort_month`,
      alt: `SELECT date_format(c.signup_date, 'yyyy-MM') AS cohort_month, COUNT(*) AS customers, count_if(EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id AND o.status = 'PAID' AND datediff(o.order_ts, c.signup_date) BETWEEN 0 AND 30)) AS converted_30d, ROUND(100 * count_if(EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id AND o.status = 'PAID' AND datediff(o.order_ts, c.signup_date) BETWEEN 0 AND 30)) / COUNT(*), 1) AS pct_30d FROM customers c WHERE year(c.signup_date) = 2025 GROUP BY 1 ORDER BY 1`,
      traps: [`SELECT date_format(c.signup_date, 'yyyy-MM') AS cohort_month, COUNT(DISTINCT c.customer_id) AS customers, COUNT(DISTINCT o.customer_id) AS converted_30d, ROUND(100 * COUNT(DISTINCT o.customer_id) / COUNT(DISTINCT c.customer_id), 1) AS pct_30d FROM customers c JOIN orders o ON o.customer_id = c.customer_id WHERE o.status = 'PAID' AND datediff(o.order_ts, c.signup_date) BETWEEN 0 AND 30 AND year(c.signup_date) = 2025 GROUP BY 1 ORDER BY 1`],
      explain: 'Cohort metrics need the full denominator: customers who never converted must stay in the count. Reducing to one row per customer before aggregating keeps the grain obvious and prevents double counting customers with several qualifying orders.',
    },
    {
      id: 'support-sla', level: 2, title: 'Support SLA by priority',
      scenario: 'Support promises a resolution within 24 hours. The SLA review needs one row per priority.',
      task: 'Per <code>priority</code>, return <code>tickets</code>, <code>closed</code>, <code>avg_hours</code> (average resolution time of closed tickets, in hours, rounded to 1) and <code>within_24h_pct</code> (closed within 24 hours as a share of closed tickets, rounded to 1). Order urgent, high, medium, low.',
      tables: ['support_tickets'], ordered: true,
      hints: ['(unix_timestamp(closed_ts) - unix_timestamp(opened_ts)) / 3600 gives hours, or timestampdiff(SECOND, …) / 3600.', 'Aggregates skip NULLs, so open tickets drop out of AVG automatically.', 'Custom sort order: ORDER BY CASE priority WHEN … END.'],
      solution: `SELECT priority,
       COUNT(*) AS tickets,
       COUNT(closed_ts) AS closed,
       ROUND(AVG((unix_timestamp(closed_ts) - unix_timestamp(opened_ts)) / 3600), 1) AS avg_hours,
       ROUND(100 * count_if(closed_ts <= opened_ts + INTERVAL 24 HOURS) / COUNT(closed_ts), 1) AS within_24h_pct
FROM support_tickets
GROUP BY priority
ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
      alt: `SELECT priority, COUNT(*) AS tickets, count_if(status = 'closed') AS closed, ROUND(AVG(timestampdiff(SECOND, opened_ts, closed_ts)) / 3600, 1) AS avg_hours, ROUND(100 * AVG(CASE WHEN closed_ts IS NOT NULL THEN IF(timestampdiff(SECOND, opened_ts, closed_ts) <= 86400, 1, 0) END), 1) AS within_24h_pct FROM support_tickets GROUP BY ALL ORDER BY array_position(array('urgent', 'high', 'medium', 'low'), priority)`,
      traps: [`SELECT priority, COUNT(*) AS tickets, count_if(status = 'closed') AS closed, ROUND(AVG(timestampdiff(SECOND, opened_ts, closed_ts)) / 3600, 1) AS avg_hours, ROUND(100 * AVG(IF(timestampdiff(SECOND, opened_ts, closed_ts) <= 86400, 1, 0)), 1) AS within_24h_pct FROM support_tickets GROUP BY ALL ORDER BY array_position(array('urgent', 'high', 'medium', 'low'), priority)`],
      explain: 'Timestamps subtract to an interval; unix_timestamp and timestampdiff turn durations into numbers you can average. Watch the denominator of a rate: "within SLA" is a share of <i>closed</i> tickets here, not of all tickets.',
    },
    {
      id: 'weekday-pattern', level: 1, title: 'Which weekday sells best?',
      scenario: 'Marketing schedules campaigns on the days customers buy most.',
      task: 'Return <code>day_name</code> (Monday, Tuesday, …) and <code>paid_orders</code>, ordered Monday to Sunday.',
      tables: ['orders'], ordered: true,
      hints: ["date_format(order_ts, 'EEEE') gives the day name; weekday(order_ts) is 0 for Monday … 6 for Sunday.", 'Group by both, select the name, order by the number.'],
      solution: `SELECT date_format(order_ts, 'EEEE') AS day_name, COUNT(*) AS paid_orders
FROM orders
WHERE status = 'PAID'
GROUP BY date_format(order_ts, 'EEEE'), weekday(order_ts)
ORDER BY weekday(order_ts)`,
      alt: `SELECT day_name, paid_orders FROM (SELECT date_format(order_ts, 'EEEE') AS day_name, (dayofweek(order_ts) + 5) % 7 AS dow, COUNT(*) AS paid_orders FROM orders WHERE status = 'PAID' GROUP BY ALL) ORDER BY dow`,
      traps: [`SELECT date_format(order_ts, 'EEEE') AS day_name, COUNT(*) AS paid_orders FROM orders WHERE status = 'PAID' GROUP BY 1 ORDER BY 1`],
      explain: 'Sorting by a label sorts alphabetically (Friday first). Keep a numeric key beside the label for ordering. <code>dayofweek</code> starts at Sunday = 1; <code>weekday</code> starts at Monday = 0.',
    },
  ]);

  /* ===================== 7. Semi-structured data ===================== */
  add('nested', [
    {
      id: 'json-paths', level: 1, title: 'App events by type and OS',
      scenario: 'Mobile engineering wants event volume per event type and operating system. The events are JSON strings.',
      task: 'Return <code>event_type</code> (the JSON field <code>event</code>), <code>os</code> (<code>device.os</code>) and <code>events</code>. Order by event_type, then os.',
      tables: ['app_events'], ordered: true,
      hints: ["Databricks extracts from a JSON string with a colon: payload:event, payload:device.os.", "get_json_object(payload, '$.device.os') is the function form."],
      solution: `SELECT payload:event AS event_type, payload:device.os AS os, COUNT(*) AS events
FROM app_events
GROUP BY ALL
ORDER BY event_type, os`,
      alt: `SELECT get_json_object(payload, '$.event') AS event_type, get_json_object(payload, '$.device.os') AS os, COUNT(*) AS events FROM app_events GROUP BY 1, 2 ORDER BY 1, 2`,
      explain: 'The colon operator is Databricks shorthand for JSON path extraction on strings, and returns strings. For repeated or heavy use, parse once with <code>from_json</code> (next challenge) or store the data as a VARIANT or STRUCT column.',
    },
    {
      id: 'from-json-items', level: 3, title: 'Tickets in purchase events',
      scenario: 'The app reports purchases as JSON with a nested list of items. Reconciliation needs tickets per event from those payloads.',
      task: 'For app events whose <code>event</code> is <code>purchase</code>, parse <code>items</code> (each has <code>event_id</code> and <code>qty</code>) and return <code>event_id</code> and <code>tickets</code> (sum of qty). Order by event_id.',
      tables: ['app_events'], ordered: true,
      hints: ["from_json(payload:items, 'ARRAY<STRUCT<event_id: INT, qty: INT>>') turns the JSON array into a typed array.", 'inline() expands an array of structs into rows and columns; explode() gives one struct per row.'],
      solution: `WITH items AS (
  SELECT inline(from_json(payload:items, 'ARRAY<STRUCT<event_id: INT, qty: INT>>'))
  FROM app_events
  WHERE payload:event = 'purchase'
)
SELECT event_id, SUM(qty) AS tickets
FROM items
GROUP BY event_id
ORDER BY event_id`,
      alt: `SELECT item.event_id, SUM(item.qty) AS tickets FROM app_events LATERAL VIEW explode(from_json(get_json_object(payload, '$.items'), 'ARRAY<STRUCT<event_id: INT, qty: INT>>')) e AS item WHERE get_json_object(payload, '$.event') = 'purchase' GROUP BY 1 ORDER BY 1`,
      explain: 'Parse JSON once into typed structs, then use ordinary SQL. In a pipeline this happens in Silver, so downstream queries never touch raw JSON strings.',
    },
    {
      id: 'cart-values', level: 2, title: 'Cart values',
      scenario: 'Abandoned-cart emails need each cart\'s number of lines and total value. Some carts are empty.',
      task: 'Return <code>cart_id</code>, <code>lines</code> (items in the cart) and <code>value</code> (sum of qty × unit_price, rounded to 2), with <b>0</b> for empty carts. Order by cart_id.',
      tables: ['carts'], ordered: true,
      hints: ['explode() drops rows whose array is empty; LATERAL VIEW OUTER explode() keeps them with NULLs.', 'Or skip exploding: size() and aggregate() work on the array directly.'],
      solution: `SELECT c.cart_id,
       COUNT(item.qty) AS lines,
       ROUND(coalesce(SUM(item.qty * item.unit_price), 0), 2) AS value
FROM carts c
LATERAL VIEW OUTER explode(c.items) e AS item
GROUP BY c.cart_id
ORDER BY c.cart_id`,
      alt: `SELECT cart_id, size(items) AS lines, ROUND(aggregate(items, CAST(0 AS DOUBLE), (acc, i) -> acc + i.qty * i.unit_price), 2) AS value FROM carts ORDER BY cart_id`,
      traps: [`SELECT c.cart_id, COUNT(*) AS lines, ROUND(SUM(item.qty * item.unit_price), 2) AS value FROM carts c LATERAL VIEW explode(c.items) e AS item GROUP BY c.cart_id ORDER BY c.cart_id`],
      explain: 'Exploding silently drops parents with empty arrays, a common source of "missing rows" bugs. Higher-order functions (<code>aggregate</code>, <code>filter</code>, <code>transform</code>) compute over arrays without changing the grain at all.',
    },
    {
      id: 'cart-hof', level: 3, title: 'VIP lines without exploding',
      scenario: 'The VIP upsell team wants per cart: how many lines are VIP tickets, and which ticket types the cart contains.',
      task: 'For carts with at least one item, return <code>cart_id</code>, <code>vip_lines</code> and <code>types</code>: the distinct ticket types as a sorted array. Order by cart_id.',
      tables: ['carts'], ordered: true,
      hints: ["filter(items, i -> i.ticket_type = 'VIP') keeps matching elements; size() counts them.", 'transform(items, i -> i.ticket_type) maps to types; array_distinct and array_sort clean up.'],
      solution: `SELECT cart_id,
       size(filter(items, i -> i.ticket_type = 'VIP')) AS vip_lines,
       array_sort(array_distinct(transform(items, i -> i.ticket_type))) AS types
FROM carts
WHERE size(items) > 0
ORDER BY cart_id`,
      alt: `SELECT cart_id, count_if(item.ticket_type = 'VIP') AS vip_lines, array_sort(collect_set(item.ticket_type)) AS types FROM carts LATERAL VIEW explode(items) e AS item GROUP BY cart_id ORDER BY 1`,
      explain: 'Arrays keep related values together at the parent\'s grain. Lambdas let you filter and map them in place, avoiding an explode-and-regroup round trip. <code>collect_set</code> has no guaranteed order, so sort before comparing or displaying.',
    },
    {
      id: 'genre-arrays', level: 2, title: 'Customers with eclectic taste',
      scenario: 'Recommendations wants customers who have paid for tickets in at least three different genres.',
      task: 'Return <code>customer_id</code>, <code>genres</code> (a sorted array of distinct genres from their PAID orders) and <code>genre_count</code>, for customers with 3 or more genres. Order by customer_id.',
      tables: ['orders', 'events'], ordered: true,
      hints: ['collect_set(genre) gathers distinct values into an array; array_sort makes it deterministic.'],
      solution: `SELECT o.customer_id,
       array_sort(collect_set(e.genre)) AS genres,
       size(collect_set(e.genre)) AS genre_count
FROM orders o
JOIN events e ON e.event_id = o.event_id
WHERE o.status = 'PAID'
GROUP BY o.customer_id
HAVING size(collect_set(e.genre)) >= 3
ORDER BY o.customer_id`,
      alt: `SELECT customer_id, genres, size(genres) AS genre_count FROM (SELECT o.customer_id, sort_array(array_distinct(collect_list(e.genre))) AS genres FROM orders o JOIN events e USING (event_id) WHERE o.status = 'PAID' GROUP BY 1) WHERE size(genres) >= 3 ORDER BY 1`,
      explain: 'Aggregating into arrays is how you build "list" columns for feature tables and APIs. <code>COUNT(DISTINCT genre)</code> would give the count alone; the array keeps the values too.',
    },
  ]);

  /* ===================== 8. Pipelines and MERGE ===================== */
  const pricesSetup = `CREATE TABLE event_prices (event_id INT NOT NULL, base_price DOUBLE, updated_at TIMESTAMP);
INSERT INTO event_prices SELECT event_id, base_price, TIMESTAMP'2026-06-01 00:00:00' FROM events WHERE event_id <= 120;`;
  add('pipelines', [
    {
      id: 'merge-upsert', level: 2, mode: 'state', idempotent: true, title: 'Upsert price changes',
      scenario: 'Pricing publishes changes to <code>price_updates</code>: some events changed price, some are new to the price table.',
      task: 'Apply <code>price_updates</code> to <code>event_prices</code>: update existing events (price and updated_at), insert new ones. Running your statement twice must give the same result.',
      tables: ['event_prices', 'price_updates'],
      setup: pricesSetup + `
CREATE TABLE price_updates (event_id INT, base_price DOUBLE, updated_at TIMESTAMP);
INSERT INTO price_updates VALUES (101, 59.0, TIMESTAMP'2026-06-20 09:00:00'), (102, 79.5, TIMESTAMP'2026-06-20 09:00:00'), (125, 99.0, TIMESTAMP'2026-06-20 09:00:00'), (131, 45.0, TIMESTAMP'2026-06-20 09:00:00')`,
      check: 'SELECT event_id, base_price, updated_at FROM event_prices ORDER BY event_id',
      hints: ['MERGE INTO target USING source ON key WHEN MATCHED THEN UPDATE SET * WHEN NOT MATCHED THEN INSERT *.'],
      solution: `MERGE INTO event_prices t
USING price_updates s
ON t.event_id = s.event_id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *`,
      alt: `UPDATE event_prices SET base_price = (SELECT s.base_price FROM price_updates s WHERE s.event_id = event_prices.event_id), updated_at = (SELECT s.updated_at FROM price_updates s WHERE s.event_id = event_prices.event_id) WHERE event_id IN (SELECT event_id FROM price_updates);
INSERT INTO event_prices SELECT * FROM price_updates s WHERE s.event_id NOT IN (SELECT event_id FROM event_prices)`,
      traps: ['INSERT INTO event_prices SELECT * FROM price_updates'],
      explain: 'MERGE applies inserts and updates atomically in one Delta transaction, so readers never see half an update. It is also naturally idempotent: rerunning it finds nothing new to change. A plain INSERT is not, and duplicates every key on a retry.',
    },
    {
      id: 'merge-dedupe-source', level: 3, mode: 'state', idempotent: true, title: 'The MERGE that fails',
      scenario: 'The nightly job MERGEs <code>price_feed</code> into <code>event_prices</code> and started failing. The feed now contains several rows per event, and sometimes stale ones. The job is in the editor.',
      task: 'Fix it. For each event, apply only the <b>latest</b> row of the feed, and never overwrite a row in <code>event_prices</code> with an older <code>updated_at</code>. Insert events that are new.',
      tables: ['event_prices', 'price_feed'],
      setup: pricesSetup + `
CREATE TABLE price_feed (event_id INT, base_price DOUBLE, updated_at TIMESTAMP);
INSERT INTO price_feed VALUES
  (101, 61.0, TIMESTAMP'2026-06-20 08:00:00'), (101, 64.0, TIMESTAMP'2026-06-21 08:00:00'),
  (102, 70.0, TIMESTAMP'2026-06-20 08:00:00'), (102, 70.0, TIMESTAMP'2026-06-20 08:00:00'),
  (103, 10.0, TIMESTAMP'2026-05-01 08:00:00'),
  (140, 88.0, TIMESTAMP'2026-06-22 08:00:00')`,
      check: 'SELECT event_id, base_price, updated_at FROM event_prices ORDER BY event_id',
      starter: `MERGE INTO event_prices t
USING price_feed s
ON t.event_id = s.event_id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *`,
      hints: ['Run it: Databricks refuses a MERGE where several source rows match one target row.', 'Deduplicate the source: QUALIFY ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY updated_at DESC) = 1.', 'Add a condition to WHEN MATCHED so older data never wins.'],
      solution: `MERGE INTO event_prices t
USING (
  SELECT * FROM price_feed
  QUALIFY ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY updated_at DESC) = 1
) s
ON t.event_id = s.event_id
WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *`,
      alt: `MERGE INTO event_prices t USING (SELECT event_id, max_by(base_price, updated_at) AS base_price, MAX(updated_at) AS updated_at FROM price_feed GROUP BY event_id) s ON t.event_id = s.event_id WHEN MATCHED AND t.updated_at < s.updated_at THEN UPDATE SET * WHEN NOT MATCHED THEN INSERT *`,
      traps: [`MERGE INTO event_prices t USING (SELECT * FROM price_feed QUALIFY ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY updated_at DESC) = 1) s ON t.event_id = s.event_id WHEN MATCHED THEN UPDATE SET * WHEN NOT MATCHED THEN INSERT *`],
      explain: 'Delta raises <code>DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE</code> rather than guess which source row should win. Always deduplicate the source to one row per key, and guard updates with a sequence column, so a replayed or late batch can never move data backwards.',
    },
    {
      id: 'scd2-merge', level: 3, mode: 'state', idempotent: true, title: 'Keep history: SCD Type 2',
      scenario: '<code>dim_customer_city</code> keeps the history of where customers live. Today\'s <code>city_changes</code> contains moves, a non-change and a brand-new customer.',
      task: 'For customers whose city changed, close the current row (<code>valid_to</code> = changed_on, <code>is_current</code> = false) and add a new current row (<code>valid_from</code> = changed_on, <code>valid_to</code> NULL). Add new customers as current rows. Leave unchanged customers alone.',
      tables: ['dim_customer_city', 'city_changes'],
      setup: `CREATE TABLE dim_customer_city (customer_id INT NOT NULL, city STRING, valid_from DATE, valid_to DATE, is_current BOOLEAN);
INSERT INTO dim_customer_city SELECT customer_id, city, DATE'2025-01-01', NULL, true FROM customers WHERE customer_id <= 5;
CREATE TABLE city_changes (customer_id INT, city STRING, changed_on DATE);
INSERT INTO city_changes VALUES (1, 'Paris', DATE'2026-06-15'), (3, 'Lima', DATE'2026-06-15'), (6, 'Oslo', DATE'2026-06-16');
INSERT INTO city_changes SELECT customer_id, city, DATE'2026-06-15' FROM customers WHERE customer_id = 2`,
      check: 'SELECT customer_id, city, valid_from, valid_to, is_current FROM dim_customer_city ORDER BY customer_id, valid_from',
      hints: ['Two steps: close changed current rows (MERGE or UPDATE), then insert a current row for every change that has no current row.', 'After step one, moved customers have no current row; LEFT ANTI JOIN finds them.'],
      solution: `MERGE INTO dim_customer_city d
USING city_changes s
ON d.customer_id = s.customer_id AND d.is_current
WHEN MATCHED AND d.city <> s.city THEN
  UPDATE SET valid_to = s.changed_on, is_current = false;

INSERT INTO dim_customer_city
SELECT s.customer_id, s.city, s.changed_on, NULL, true
FROM city_changes s
LEFT ANTI JOIN dim_customer_city d
  ON d.customer_id = s.customer_id AND d.is_current`,
      alt: `MERGE INTO dim_customer_city d
USING (
  SELECT customer_id AS merge_key, * FROM city_changes
  UNION ALL
  SELECT NULL, s.* FROM city_changes s JOIN dim_customer_city d ON d.customer_id = s.customer_id AND d.is_current WHERE d.city <> s.city
) s
ON d.customer_id = s.merge_key AND d.is_current
WHEN MATCHED AND d.city <> s.city THEN UPDATE SET valid_to = s.changed_on, is_current = false
WHEN NOT MATCHED THEN INSERT (customer_id, city, valid_from, valid_to, is_current) VALUES (s.customer_id, s.city, s.changed_on, NULL, true)`,
      traps: [`UPDATE dim_customer_city SET city = (SELECT s.city FROM city_changes s WHERE s.customer_id = dim_customer_city.customer_id) WHERE customer_id IN (SELECT customer_id FROM city_changes)`],
      explain: 'The alternative is the classic single-MERGE SCD2 trick: changed rows appear twice in the source, once to close the old version and once (with a NULL merge key, so it never matches) to insert the new one. In a declarative pipeline, <code>AUTO CDC … STORED AS SCD TYPE 2</code> does all of this, including out-of-order changes.',
    },
    {
      id: 'dedupe-delete', level: 2, mode: 'state', title: 'Remove duplicate charges',
      scenario: 'Before finance reconciles, the duplicate settled charges must be removed from <code>payments_clean</code>, keeping each order\'s earliest settled charge. Failed attempts stay.',
      task: 'Delete every SETTLED payment that is not the earliest settled payment of its order (by paid_ts, then payment_id).',
      tables: ['payments_clean'],
      setup: 'CREATE TABLE payments_clean AS SELECT * FROM payments',
      check: 'SELECT payment_id, order_id, status FROM payments_clean ORDER BY payment_id',
      hints: ['Find the duplicates with ROW_NUMBER() … > 1, then DELETE … WHERE payment_id IN (…).'],
      solution: `DELETE FROM payments_clean
WHERE payment_id IN (
  SELECT payment_id FROM payments_clean
  WHERE status = 'SETTLED'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY paid_ts, payment_id) > 1
)`,
      alt: `MERGE INTO payments_clean t USING (SELECT payment_id FROM payments_clean WHERE status = 'SETTLED' QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY paid_ts, payment_id) > 1) d ON t.payment_id = d.payment_id WHEN MATCHED THEN DELETE`,
      traps: [`DELETE FROM payments_clean WHERE order_id IN (SELECT order_id FROM payments_clean WHERE status = 'SETTLED' GROUP BY order_id HAVING COUNT(*) > 1)`, `DELETE FROM payments_clean WHERE payment_id IN (SELECT payment_id FROM payments_clean QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY paid_ts, payment_id) > 1)`],
      explain: 'Identify exactly the rows to remove by key, rather than deleting whole groups. On Delta, a DELETE is versioned: <code>DESCRIBE HISTORY</code> shows it, and time travel can restore the previous version if the rule was wrong.',
    },
    {
      id: 'incremental-load', level: 2, mode: 'state', idempotent: true, title: 'An incremental daily load',
      scenario: '<code>daily_sales</code> is loaded up to the end of February 2026. The job must append newer days only, and a retry must not double anything.',
      task: 'Append one row per day after the latest day already in <code>daily_sales</code>: <code>day</code>, <code>paid_orders</code> (distinct PAID orders) and <code>revenue</code> (rounded to 2), computed from orders and order_items.',
      tables: ['daily_sales', 'orders', 'order_items'],
      setup: `CREATE TABLE daily_sales (day DATE NOT NULL, paid_orders INT, revenue DOUBLE);
INSERT INTO daily_sales
SELECT CAST(o.order_ts AS DATE), COUNT(DISTINCT o.order_id), ROUND(SUM(i.quantity * i.unit_price), 2)
FROM orders o JOIN order_items i ON i.order_id = o.order_id
WHERE o.status = 'PAID' AND o.order_ts < '2026-03-01'
GROUP BY 1`,
      check: 'SELECT day, paid_orders, revenue FROM daily_sales ORDER BY day',
      hints: ['The high-water mark is (SELECT MAX(day) FROM daily_sales).', 'Filter the source on it, so a rerun finds nothing new.'],
      solution: `INSERT INTO daily_sales
SELECT CAST(o.order_ts AS DATE) AS day,
       COUNT(DISTINCT o.order_id) AS paid_orders,
       ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
WHERE o.status = 'PAID'
  AND CAST(o.order_ts AS DATE) > (SELECT MAX(day) FROM daily_sales)
GROUP BY 1`,
      alt: `MERGE INTO daily_sales t USING (SELECT to_date(order_ts) AS day, COUNT(DISTINCT order_id) AS paid_orders, ROUND(SUM(quantity * unit_price), 2) AS revenue FROM orders JOIN order_items USING (order_id) WHERE status = 'PAID' GROUP BY 1) s ON t.day = s.day WHEN NOT MATCHED THEN INSERT *`,
      traps: [`INSERT INTO daily_sales SELECT CAST(o.order_ts AS DATE), COUNT(DISTINCT o.order_id), ROUND(SUM(i.quantity * i.unit_price), 2) FROM orders o JOIN order_items i ON i.order_id = o.order_id WHERE o.status = 'PAID' GROUP BY 1`],
      explain: 'A high-water mark makes a batch load incremental and idempotent. Its weakness is late data: an order that arrives after its day was loaded is never picked up. Production pipelines either reprocess a trailing window with MERGE, or use streaming tables, which track what has already been processed.',
    },
    {
      id: 'ctas-summary', level: 2, mode: 'state', title: 'Publish a Gold table',
      scenario: 'The CRM sync reads a <code>customer_summary</code> table every morning.',
      task: 'Create <code>customer_summary</code> with one row per customer who has at least one order: <code>customer_id</code>, <code>orders</code> (all statuses), <code>paid_revenue</code> (sum of line totals of PAID orders, 0 if none, rounded to 2), <code>first_order_ts</code> and <code>last_order_ts</code>. Column names matter here.',
      tables: ['orders', 'order_items'],
      check: 'SELECT customer_id, orders, paid_revenue, first_order_ts, last_order_ts FROM customer_summary ORDER BY customer_id',
      hints: ['CREATE OR REPLACE TABLE … AS SELECT makes it rerunnable.', 'Compute order totals per order first, so COUNT and MIN/MAX are at the order grain.'],
      solution: `CREATE OR REPLACE TABLE customer_summary AS
WITH order_totals AS (
  SELECT o.order_id, o.customer_id, o.status, o.order_ts, SUM(i.quantity * i.unit_price) AS total
  FROM orders o JOIN order_items i ON i.order_id = o.order_id
  GROUP BY ALL
)
SELECT customer_id,
       COUNT(*) AS orders,
       ROUND(coalesce(SUM(total) FILTER (WHERE status = 'PAID'), 0), 2) AS paid_revenue,
       MIN(order_ts) AS first_order_ts,
       MAX(order_ts) AS last_order_ts
FROM order_totals
GROUP BY customer_id`,
      alt: `CREATE TABLE customer_summary AS SELECT o.customer_id, COUNT(DISTINCT o.order_id) AS orders, ROUND(SUM(IF(o.status = 'PAID', i.quantity * i.unit_price, 0)), 2) AS paid_revenue, MIN(o.order_ts) AS first_order_ts, MAX(o.order_ts) AS last_order_ts FROM orders o JOIN order_items i USING (order_id) GROUP BY o.customer_id`,
      explain: '<code>CREATE OR REPLACE TABLE … AS SELECT</code> rebuilds a table atomically: readers see the old version until the new one is committed, and the table history keeps both. On a real pipeline, a materialized view gives you the same with incremental refresh.',
    },
  ]);

  /* ===================== 9. Hierarchies ===================== */
  add('recursive', [
    {
      id: 'org-paths', level: 2, title: 'Everyone\'s chain of command',
      scenario: 'The new HR portal shows each employee\'s level and full reporting line.',
      task: 'Return <code>employee_id</code>, <code>name</code>, <code>level</code> (CEO = 0) and <code>path</code>: names from the CEO down to the employee, separated by <code> &gt; </code>. Order by employee_id.',
      tables: ['employees'], ordered: true,
      hints: ['WITH RECURSIVE: an anchor row for the CEO, then a recursive member joining employees to the rows found so far.', "path || ' > ' || e.name builds the path as you descend."],
      solution: `WITH RECURSIVE chain AS (
  SELECT employee_id, name, 0 AS level, name AS path
  FROM employees
  WHERE manager_id IS NULL
  UNION ALL
  SELECT e.employee_id, e.name, c.level + 1, c.path || ' > ' || e.name
  FROM employees e
  JOIN chain c ON e.manager_id = c.employee_id
)
SELECT employee_id, name, level, path
FROM chain
ORDER BY employee_id`,
      alt: `SELECT e.employee_id, e.name, (CASE WHEN m1.name IS NULL THEN 0 ELSE 1 END + CASE WHEN m2.name IS NULL THEN 0 ELSE 1 END + CASE WHEN m3.name IS NULL THEN 0 ELSE 1 END + CASE WHEN m4.name IS NULL THEN 0 ELSE 1 END) AS level, concat_ws(' > ', m4.name, m3.name, m2.name, m1.name, e.name) AS path FROM employees e LEFT JOIN employees m1 ON m1.employee_id = e.manager_id LEFT JOIN employees m2 ON m2.employee_id = m1.manager_id LEFT JOIN employees m3 ON m3.employee_id = m2.manager_id LEFT JOIN employees m4 ON m4.employee_id = m3.manager_id ORDER BY 1`,
      explain: 'A recursive CTE walks a hierarchy of any depth; the chain of self joins in the alternative only works up to a fixed depth. Recursive CTEs are available on recent Databricks runtimes and SQL warehouses; always make sure the recursion terminates.',
    },
    {
      id: 'headcount', level: 3, title: 'Total headcount per manager',
      scenario: 'Finance allocates budget by the total number of people in each manager\'s organization, direct and indirect.',
      task: 'For every employee with at least one report, return <code>name</code> and <code>headcount</code> (everyone below them, at any depth). Order by headcount descending, then name.',
      tables: ['employees'], ordered: true,
      hints: ['Recursive pairs (boss, employee): start from direct reports, then extend each pair downwards.'],
      solution: `WITH RECURSIVE reports AS (
  SELECT manager_id AS boss_id, employee_id
  FROM employees
  WHERE manager_id IS NOT NULL
  UNION ALL
  SELECT r.boss_id, e.employee_id
  FROM reports r
  JOIN employees e ON e.manager_id = r.employee_id
)
SELECT m.name, COUNT(*) AS headcount
FROM reports r
JOIN employees m ON m.employee_id = r.boss_id
GROUP BY m.name
ORDER BY headcount DESC, m.name`,
      alt: `WITH RECURSIVE chain AS (SELECT employee_id, name AS path FROM employees WHERE manager_id IS NULL UNION ALL SELECT e.employee_id, c.path || ' > ' || e.name FROM employees e JOIN chain c ON e.manager_id = c.employee_id) SELECT m.name, COUNT(*) AS headcount FROM employees m JOIN chain c ON c.path LIKE '%' || m.name || ' > %' GROUP BY m.name ORDER BY 2 DESC, 1`,
      explain: 'Materializing (ancestor, descendant) pairs, sometimes called a closure table, turns every "everyone under X" question into a simple join and GROUP BY.',
    },
    {
      id: 'referral-roots', level: 3, title: 'Who started the referral chain?',
      scenario: 'Marketing rewards customers whose referrals went at least two levels deep.',
      task: 'For customers at depth 2 or more in a referral chain (referred by someone who was themselves referred), return <code>customer_id</code>, <code>root_id</code> (the customer at the top of the chain, who was referred by no one) and <code>depth</code>. Order by customer_id.',
      tables: ['customers'], ordered: true,
      hints: ['Anchor: customers with referred_by IS NULL, at depth 0 and as their own root.', 'Recursive member: customers referred by someone already in the result.'],
      solution: `WITH RECURSIVE chain AS (
  SELECT customer_id, customer_id AS root_id, 0 AS depth
  FROM customers
  WHERE referred_by IS NULL
  UNION ALL
  SELECT c.customer_id, ch.root_id, ch.depth + 1
  FROM customers c
  JOIN chain ch ON c.referred_by = ch.customer_id
)
SELECT customer_id, root_id, depth
FROM chain
WHERE depth >= 2
ORDER BY customer_id`,
      alt: `WITH RECURSIVE up AS (SELECT customer_id, customer_id AS cur, referred_by AS nxt, 0 AS depth FROM customers UNION ALL SELECT u.customer_id, c.customer_id, c.referred_by, u.depth + 1 FROM up u JOIN customers c ON c.customer_id = u.nxt) SELECT customer_id, cur AS root_id, depth FROM up WHERE nxt IS NULL AND depth >= 2 ORDER BY 1`,
      explain: 'The solution walks down from the roots; the alternative walks up from every customer. Both are valid. Walking down is cheaper when there are few roots, and walking up when you only need a few customers\' ancestry.',
    },
  ]);

  /* ===================== 10. Incidents ===================== */
  add('incidents', [
    {
      id: 'not-in-null', level: 2, title: 'Zero customers who never referred?',
      scenario: 'A churn report claims there are no customers who have never referred anyone, which nobody believes. The query is in the editor.',
      task: 'Fix it. Return one column, <code>customers</code>: the number of customers whose <code>customer_id</code> never appears as anyone\'s <code>referred_by</code>.',
      tables: ['customers'],
      starter: `SELECT COUNT(*) AS customers
FROM customers
WHERE customer_id NOT IN (SELECT referred_by FROM customers)`,
      hints: ['What does the subquery return for customers who were not referred?', 'x NOT IN (1, 2, NULL) is never true: it is false or NULL.'],
      solution: `SELECT COUNT(*) AS customers
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM customers r WHERE r.referred_by = c.customer_id)`,
      alt: `SELECT COUNT(*) AS customers FROM customers WHERE customer_id NOT IN (SELECT referred_by FROM customers WHERE referred_by IS NOT NULL)`,
      explain: '<code>NOT IN</code> against a subquery that returns a single NULL matches nothing, because <code>x &lt;&gt; NULL</code> is unknown. This is one of the most common silent bugs in SQL. Prefer <code>NOT EXISTS</code> or <code>LEFT ANTI JOIN</code>, which are NULL-safe.',
    },
    {
      id: 'avg-of-avgs', level: 2, title: 'Average order value is off',
      scenario: 'The channel dashboard\'s average order value disagrees with finance. The query is in the editor.',
      task: 'Fix it. Return <code>channel</code> and <code>avg_order_value</code>: the average total of PAID orders (an order\'s total is the sum of its lines), rounded to 2. Order by channel.',
      tables: ['orders', 'order_items'], ordered: true,
      starter: `WITH per_customer AS (
  SELECT o.channel, o.customer_id, AVG(i.quantity * i.unit_price) AS aov
  FROM orders o JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'PAID'
  GROUP BY ALL
)
SELECT channel, ROUND(AVG(aov), 2) AS avg_order_value
FROM per_customer
GROUP BY channel
ORDER BY channel`,
      hints: ['There are two bugs. What is being averaged in the CTE: orders or order lines?', 'An average of per-customer averages weights a customer with one order the same as one with twenty.'],
      solution: `WITH order_totals AS (
  SELECT o.order_id, o.channel, SUM(i.quantity * i.unit_price) AS total
  FROM orders o JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'PAID'
  GROUP BY ALL
)
SELECT channel, ROUND(AVG(total), 2) AS avg_order_value
FROM order_totals
GROUP BY channel
ORDER BY channel`,
      alt: `SELECT o.channel, ROUND(SUM(i.quantity * i.unit_price) / COUNT(DISTINCT o.order_id), 2) AS avg_order_value FROM orders o JOIN order_items i USING (order_id) WHERE o.status = 'PAID' GROUP BY 1 ORDER BY 1`,
      explain: 'Two classics: averaging at the wrong grain (lines instead of orders), and averaging averages. Compute a ratio metric as total ÷ count at the grain the business means.',
    },
    {
      id: 'union-loses-money', level: 2, title: 'The ledger is short',
      scenario: 'Treasury\'s total of settled cash is lower than the bank statement. The query combines card and non-card payments.',
      task: 'Fix it. Return one column, <code>total_settled</code>: the sum of every SETTLED payment, card and non-card, rounded to 2. Duplicate charges count: the money really was taken.',
      tables: ['payments'],
      starter: `SELECT ROUND(SUM(amount), 2) AS total_settled
FROM (
  SELECT order_id, amount FROM payments WHERE status = 'SETTLED' AND method = 'card'
  UNION
  SELECT order_id, amount FROM payments WHERE status = 'SETTLED' AND method <> 'card'
)`,
      hints: ['What does UNION do that UNION ALL does not?', 'Two duplicate charges have the same order_id and amount.'],
      solution: `SELECT ROUND(SUM(amount), 2) AS total_settled
FROM payments
WHERE status = 'SETTLED'`,
      alt: `SELECT ROUND(SUM(amount), 2) AS total_settled FROM (SELECT order_id, amount FROM payments WHERE status = 'SETTLED' AND method = 'card' UNION ALL SELECT order_id, amount FROM payments WHERE status = 'SETTLED' AND method <> 'card')`,
      explain: 'UNION removes duplicate rows across the whole result, which also removes legitimate duplicates such as two identical charges. Use UNION ALL unless you specifically want deduplication, and keep a unique key in the projection.',
    },
    {
      id: 'net-revenue', level: 3, title: 'Net revenue, properly',
      scenario: 'The monthly net revenue chart counts failed attempts and duplicate charges, books refunds in the wrong month, and shows NULL for months without refunds. The query is in the editor.',
      task: 'Return <code>month</code> (<code>yyyy-MM</code>), <code>gross</code>, <code>refunds</code> and <code>net</code>, all rounded to 2. <b>gross</b>: SETTLED payments, counting only each order\'s earliest settled charge, in the month of that charge. <b>refunds</b>: refunds in the month of refund_ts, excluding refunds for orders that don\'t exist. <b>net</b> = gross − refunds, treating a missing side as 0. Include every month with either. Order by month.',
      tables: ['payments', 'refunds', 'orders'], ordered: true,
      starter: `SELECT date_format(p.paid_ts, 'yyyy-MM') AS month,
       ROUND(SUM(p.amount), 2) AS gross,
       ROUND(SUM(r.amount), 2) AS refunds,
       ROUND(SUM(p.amount) - SUM(r.amount), 2) AS net
FROM payments p
LEFT JOIN refunds r ON r.order_id = p.order_id
GROUP BY 1
ORDER BY 1`,
      hints: ['Aggregate gross and refunds separately, each by its own month, then FULL OUTER JOIN the two.', 'Deduplicate charges with QUALIFY ROW_NUMBER() … = 1 over SETTLED payments.', 'coalesce(x, 0) before subtracting.'],
      solution: `WITH charges AS (
  SELECT date_format(paid_ts, 'yyyy-MM') AS month, amount
  FROM payments
  WHERE status = 'SETTLED'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY paid_ts, payment_id) = 1
), g AS (
  SELECT month, SUM(amount) AS gross FROM charges GROUP BY month
), rf AS (
  SELECT date_format(r.refund_ts, 'yyyy-MM') AS month, SUM(r.amount) AS refunds
  FROM refunds r
  LEFT SEMI JOIN orders o ON o.order_id = r.order_id
  GROUP BY 1
)
SELECT coalesce(g.month, rf.month) AS month,
       ROUND(coalesce(g.gross, 0), 2) AS gross,
       ROUND(coalesce(rf.refunds, 0), 2) AS refunds,
       ROUND(coalesce(g.gross, 0) - coalesce(rf.refunds, 0), 2) AS net
FROM g
FULL OUTER JOIN rf ON rf.month = g.month
ORDER BY 1`,
      alt: `WITH movements AS (SELECT date_format(paid_ts, 'yyyy-MM') AS month, amount AS gross, 0 AS refund FROM payments WHERE status = 'SETTLED' QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY paid_ts, payment_id) = 1 UNION ALL SELECT date_format(refund_ts, 'yyyy-MM'), 0, amount FROM refunds WHERE order_id IN (SELECT order_id FROM orders)) SELECT month, ROUND(SUM(gross), 2) AS gross, ROUND(SUM(refund), 2) AS refunds, ROUND(SUM(gross) - SUM(refund), 2) AS net FROM movements GROUP BY month ORDER BY month`,
      explain: 'Most broken finance queries combine several facts at different grains and dates in one join. Aggregate each fact at its own grain and date first, then combine the summaries, with a FULL OUTER JOIN or a UNION ALL of signed movements as in the alternative.',
    },
    {
      id: 'funnel', level: 3, title: 'The checkout funnel',
      scenario: 'Product wants to know where logged-in visitors drop off between the homepage and the order confirmation.',
      task: 'For logged-in views only, return <code>stage</code> (home, event, seats, checkout, confirmation, in that order), <code>visitors</code> (distinct customers who viewed that page) and <code>pct_of_previous</code> = 100 × visitors / the previous stage\'s visitors, rounded to 1 (NULL for home).',
      tables: ['page_views'], ordered: true,
      hints: ['An inline table defines the stages and their order: VALUES (1, \'home\'), (2, \'event\'), …', 'LAG(visitors) OVER (ORDER BY step).'],
      solution: `WITH stages AS (
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
ORDER BY step`,
      alt: `WITH v AS (SELECT page, array_position(array('home', 'event', 'seats', 'checkout', 'confirmation'), page) AS step, COUNT(DISTINCT customer_id) AS visitors FROM page_views WHERE customer_id IS NOT NULL AND page IN ('home', 'event', 'seats', 'checkout', 'confirmation') GROUP BY page) SELECT page AS stage, visitors, ROUND(100 * visitors / LAG(visitors) OVER (ORDER BY step), 1) AS pct_of_previous FROM v ORDER BY step`,
      explain: 'This is a simple, page-based funnel. A strict funnel also requires the steps in order within a session. That combines this challenge with sessionization: number each customer\'s views and check that each step happened after the previous one.',
    },
    {
      id: 'kpi-capstone', level: 3, title: 'Capstone: the monthly KPI table',
      scenario: 'The exec team gets one table per month. Build it for the first half of 2026 (orders placed January to June).',
      task: 'Per <code>month</code> (<code>yyyy-MM</code> of order_ts): <code>paid_orders</code>; <code>tickets</code> (PAID); <code>gross_bookings</code> (PAID line totals, rounded to 2); <code>active_customers</code> (distinct customers with a PAID order); <code>avg_tickets_per_order</code> (PAID, rounded to 2); <code>refund_rate_pct</code> = REFUNDED orders / (PAID + REFUNDED orders) × 100, rounded to 1. Order by month.',
      tables: ['orders', 'order_items'], ordered: true,
      hints: ['Summarize order_items to one row per order first, so every metric is at the order grain.', 'FILTER (WHERE status = \'PAID\') works on any aggregate, including COUNT(DISTINCT …).'],
      solution: `WITH lines AS (
  SELECT order_id, SUM(quantity) AS tickets, SUM(quantity * unit_price) AS amount
  FROM order_items
  GROUP BY order_id
)
SELECT date_format(o.order_ts, 'yyyy-MM') AS month,
       count_if(o.status = 'PAID') AS paid_orders,
       SUM(l.tickets) FILTER (WHERE o.status = 'PAID') AS tickets,
       ROUND(SUM(l.amount) FILTER (WHERE o.status = 'PAID'), 2) AS gross_bookings,
       COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status = 'PAID') AS active_customers,
       ROUND(AVG(l.tickets) FILTER (WHERE o.status = 'PAID'), 2) AS avg_tickets_per_order,
       ROUND(100 * count_if(o.status = 'REFUNDED') / count_if(o.status IN ('PAID', 'REFUNDED')), 1) AS refund_rate_pct
FROM orders o
JOIN lines l ON l.order_id = o.order_id
WHERE o.order_ts >= '2026-01-01' AND o.order_ts < '2026-07-01'
GROUP BY 1
ORDER BY 1`,
      alt: `WITH o AS (SELECT order_id, customer_id, status, date_format(order_ts, 'yyyy-MM') AS month FROM orders WHERE year(order_ts) = 2026 AND month(order_ts) <= 6), paid AS (SELECT o.month, o.order_id, o.customer_id, SUM(i.quantity) AS tickets, SUM(i.quantity * i.unit_price) AS amount FROM o JOIN order_items i USING (order_id) WHERE o.status = 'PAID' GROUP BY ALL), p AS (SELECT month, COUNT(*) AS paid_orders, SUM(tickets) AS tickets, ROUND(SUM(amount), 2) AS gross_bookings, COUNT(DISTINCT customer_id) AS active_customers, ROUND(AVG(tickets), 2) AS avg_tickets_per_order FROM paid GROUP BY month), r AS (SELECT month, ROUND(100 * count_if(status = 'REFUNDED') / count_if(status IN ('PAID', 'REFUNDED')), 1) AS refund_rate_pct FROM o GROUP BY month) SELECT p.*, r.refund_rate_pct FROM p JOIN r USING (month) ORDER BY month`,
      explain: 'A KPI table is several metrics that must share one grain and one set of definitions. Pre-aggregating children to the parent\'s grain, then using FILTER per metric, keeps it to a single pass. On Databricks, publishing the definitions as a metric view keeps every dashboard consistent.',
    },
  ]);
})(typeof window !== 'undefined' ? window : global);
