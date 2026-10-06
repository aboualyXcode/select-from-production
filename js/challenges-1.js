/* challenges-1.js: tracks 1–5. Every challenge has a reference solution and an independent
   alternative (tests require both to agree), plus traps: the classic wrong answers, which the grader
   must reject. Write SQL as you would on a Databricks SQL warehouse. */
(function (root) {
  'use strict';
  const X = root.SQLX = root.SQLX || {};
  X.TRACKS = [
    { id: 'foundations', title: 'Foundations', blurb: 'Filtering, NULLs, CASE, strings and dates. Small steps, production habits.' },
    { id: 'joins', title: 'Joins', blurb: 'Enrichment, zero-count rows, anti and semi joins, self joins, range joins, fan-out.' },
    { id: 'aggregation', title: 'Aggregation', blurb: 'GROUP BY ALL, HAVING, FILTER, conditional pivots, rollups, max_by, percentiles.' },
    { id: 'windows', title: 'Window functions', blurb: 'Top-N per group with QUALIFY, deduplication, running totals, period-over-period.' },
    { id: 'quality', title: 'Data quality', blurb: 'Duplicates, messy strings, safe casting, orphans, NULL-safe comparison.' },
    { id: 'time', title: 'Dates and time series', blurb: 'Zero-filling, gaps and islands, sessionization, cohorts, SLAs.' },
    { id: 'nested', title: 'Semi-structured data', blurb: 'JSON paths, from_json, explode, inline, higher-order functions.' },
    { id: 'pipelines', title: 'Pipelines and MERGE', blurb: 'Upserts, deduplicating sources, SCD Type 2, idempotent incremental loads.' },
    { id: 'recursive', title: 'Hierarchies', blurb: 'Recursive CTEs over org charts and referral chains.' },
    { id: 'incidents', title: 'Incidents', blurb: 'The dashboard is wrong. Find out why, and fix the query.' },
  ];
  X.CHALLENGES = X.CHALLENGES || [];
  const add = (track, list) => list.forEach(c => X.CHALLENGES.push(Object.assign({ track, mode: 'query', ordered: false, hints: [], traps: [] }, c)));

  /* ===================== 1. Foundations ===================== */
  add('foundations', [
    {
      id: 'partner-paid-2026', level: 1, title: 'Partner sales this year',
      scenario: 'The partnerships team pays commission on paid orders that came through the partner channel.',
      task: 'Return <code>order_id</code>, <code>customer_id</code> and <code>order_ts</code> for every <b>PAID</b> order from the <b>partner</b> channel placed in <b>2026</b>. Newest first; break ties by <code>order_id</code>.',
      tables: ['orders'], ordered: true,
      hints: ['Three conditions in WHERE, joined with AND.', "A timestamp compares with a string such as '2026-01-01'. year(order_ts) = 2026 also works."],
      solution: `SELECT order_id, customer_id, order_ts
FROM orders
WHERE status = 'PAID'
  AND channel = 'partner'
  AND order_ts >= '2026-01-01'
ORDER BY order_ts DESC, order_id`,
      alt: `SELECT order_id, customer_id, order_ts FROM orders WHERE year(order_ts) = 2026 AND status = 'PAID' AND channel = 'partner' ORDER BY 3 DESC, 1`,
      traps: [`SELECT order_id, customer_id, order_ts FROM orders WHERE channel = 'partner' AND order_ts >= '2026-01-01' ORDER BY order_ts DESC, order_id`],
      explain: 'Filtering on a timestamp with a range (<code>&gt;= \'2026-01-01\'</code>) lets Delta skip files by min/max statistics. Wrapping the column in a function (<code>year(order_ts)</code>) gives the same answer but can prevent that skipping on large tables.',
    },
    {
      id: 'missing-emails', level: 1, title: 'Who can we not email?',
      scenario: 'Marketing is about to send the spring newsletter and wants to know which customers have no email on file.',
      task: 'Return <code>customer_id</code> and <code>full_name</code> of customers whose <code>email</code> is missing, ordered by <code>customer_id</code>.',
      tables: ['customers'], ordered: true,
      hints: ['Nothing is ever equal to NULL, not even NULL.', 'Use IS NULL.'],
      solution: `SELECT customer_id, full_name
FROM customers
WHERE email IS NULL
ORDER BY customer_id`,
      alt: `SELECT customer_id, full_name FROM customers WHERE NOT (email IS NOT NULL) ORDER BY customer_id`,
      traps: [`SELECT customer_id, full_name FROM customers WHERE email = NULL ORDER BY customer_id`, `SELECT customer_id, full_name FROM customers WHERE email = '' ORDER BY customer_id`],
      explain: '<code>email = NULL</code> is never true: any comparison with NULL yields NULL, and WHERE keeps only rows where the condition is true. Use <code>IS NULL</code>, <code>IS NOT NULL</code>, or the NULL-safe <code>&lt;=&gt;</code>.',
    },
    {
      id: 'price-bands', level: 1, title: 'Price bands',
      scenario: 'Merchandising groups concerts into price bands for the homepage carousel.',
      task: 'Return <code>event_id</code>, <code>event_name</code>, <code>base_price</code> and <code>band</code>: <b>budget</b> under 50, <b>standard</b> from 50 up to (not including) 100, <b>premium</b> from 100. Order by <code>base_price</code> descending, then <code>event_id</code>.',
      tables: ['events'], ordered: true,
      hints: ['CASE WHEN … THEN … evaluates conditions in order and returns the first match.'],
      solution: `SELECT event_id, event_name, base_price,
       CASE WHEN base_price < 50 THEN 'budget'
            WHEN base_price < 100 THEN 'standard'
            ELSE 'premium' END AS band
FROM events
ORDER BY base_price DESC, event_id`,
      alt: `SELECT event_id, event_name, base_price, IF(base_price >= 100, 'premium', IF(base_price >= 50, 'standard', 'budget')) AS band FROM events ORDER BY base_price DESC, event_id`,
      traps: [`SELECT event_id, event_name, base_price, CASE WHEN base_price <= 50 THEN 'budget' WHEN base_price <= 100 THEN 'standard' ELSE 'premium' END AS band FROM events ORDER BY base_price DESC, event_id`],
      explain: 'Because CASE stops at the first true branch, each later branch only needs its upper bound. Boundaries are where bugs live: "under 50" is <code>&lt; 50</code>, and 100 itself is premium.',
    },
    {
      id: 'customer-locations', level: 1, title: 'Where are our customers?',
      scenario: 'The events team is planning a new tour and wants every country and city we have customers in.',
      task: 'Return each distinct <code>country</code> and <code>city</code> pair, ordered by country, then city.',
      tables: ['customers'], ordered: true,
      hints: ['SELECT DISTINCT removes duplicate rows across all selected columns.'],
      solution: `SELECT DISTINCT country, city
FROM customers
ORDER BY country, city`,
      alt: `SELECT country, city FROM customers GROUP BY country, city ORDER BY 1, 2`,
      traps: [`SELECT DISTINCT country, city FROM customers ORDER BY city, country`],
      explain: 'DISTINCT and GROUP BY without aggregates produce the same result. Use DISTINCT to express "unique rows" and GROUP BY when you aggregate.',
    },
    {
      id: 'event-labels', level: 1, title: 'Event labels for the app',
      scenario: 'The mobile app shows each event as a one-line label, for example <code>AURORA VALE | 14 May 2025</code>.',
      task: 'Return <code>event_id</code> and <code>label</code>: the artist in upper case, a space, a pipe, a space, and the event date formatted <code>dd MMM yyyy</code>. Order by <code>event_date</code>, then <code>event_id</code>.',
      tables: ['events'], ordered: true,
      hints: ['upper(), || or concat(), and date_format(date, pattern).', "Databricks date patterns are Java-style: dd = day, MMM = short month name, yyyy = year."],
      solution: `SELECT event_id,
       upper(artist) || ' | ' || date_format(event_date, 'dd MMM yyyy') AS label
FROM events
ORDER BY event_date, event_id`,
      alt: `SELECT event_id, concat(upper(artist), ' | ', date_format(event_date, 'dd MMM yyyy')) AS label FROM events ORDER BY event_date, event_id`,
      traps: [`SELECT event_id, upper(artist) || ' | ' || date_format(event_date, 'DD MMM YYYY') AS label FROM events ORDER BY event_date, event_id`],
      explain: 'Pattern letters are case-sensitive: <code>MM</code> is month, <code>mm</code> is minutes, <code>dd</code> is day of month and <code>DD</code> is day of year. A wrong-case pattern often still runs and quietly returns nonsense.',
    },
    {
      id: 'promo-search', level: 1, title: 'Which promo codes were used?',
      scenario: 'Finance is auditing discounts. Codes containing <code>vip</code> (any case) or starting with <code>SPRING</code> need review.',
      task: 'Return <code>order_id</code> and <code>promo_code</code> for orders whose code contains <code>vip</code> in any letter case, or starts with <code>SPRING</code>. Order by <code>order_id</code>.',
      tables: ['orders'], ordered: true,
      hints: ['ILIKE is a case-insensitive LIKE.', '% matches any sequence of characters.'],
      solution: `SELECT order_id, promo_code
FROM orders
WHERE promo_code ILIKE '%vip%' OR promo_code LIKE 'SPRING%'
ORDER BY order_id`,
      alt: `SELECT order_id, promo_code FROM orders WHERE lower(promo_code) LIKE '%vip%' OR startswith(promo_code, 'SPRING') ORDER BY order_id`,
      traps: [`SELECT order_id, promo_code FROM orders WHERE promo_code LIKE '%vip%' OR promo_code LIKE 'SPRING%' ORDER BY order_id`],
      explain: 'LIKE is case-sensitive on Databricks. ILIKE, or comparing <code>lower()</code> on both sides, handles inconsistent casing. Rows with a NULL promo code drop out automatically: NULL LIKE anything is NULL.',
    },
  ]);

  /* ===================== 2. Joins ===================== */
  add('joins', [
    {
      id: 'enrich-orders', level: 1, title: 'Who bought tickets for event 112?',
      scenario: 'The venue for event 112 wants a guest list with names and the venue they bought for.',
      task: 'For orders of <code>event_id = 112</code>, return <code>order_id</code>, the customer\'s <code>full_name</code> and the venue <code>name</code> as <code>venue</code>. Order by <code>order_id</code>.',
      tables: ['orders', 'customers', 'events', 'venues'], ordered: true,
      hints: ['orders → customers on customer_id, orders → events on event_id, events → venues on venue_id.'],
      solution: `SELECT o.order_id, c.full_name, v.name AS venue
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
JOIN events e ON e.event_id = o.event_id
JOIN venues v ON v.venue_id = e.venue_id
WHERE o.event_id = 112
ORDER BY o.order_id`,
      alt: `SELECT order_id, full_name, v.name AS venue FROM orders JOIN customers USING (customer_id) JOIN events e USING (event_id) JOIN venues v ON v.venue_id = e.venue_id WHERE event_id = 112 ORDER BY order_id`,
      explain: 'Alias every table and qualify every column in multi-table queries. It prevents <code>AMBIGUOUS_REFERENCE</code> errors when two tables share a column name, and it shows readers where each value comes from.',
    },
    {
      id: 'paid-orders-per-customer', level: 2, title: 'Paid orders per customer, zeros included',
      scenario: 'The CRM team wants every customer with their number of paid orders, so they can target customers with none.',
      task: 'Return every customer\'s <code>customer_id</code> and <code>paid_orders</code>, including customers with <b>0</b>. Order by <code>customer_id</code>.',
      tables: ['customers', 'orders'], ordered: true,
      hints: ['A LEFT JOIN keeps every customer.', 'Where you put the status filter matters: in ON, or in WHERE?', 'COUNT(*) counts the NULL row a LEFT JOIN produces for customers without orders. COUNT(o.order_id) does not.'],
      solution: `SELECT c.customer_id, COUNT(o.order_id) AS paid_orders
FROM customers c
LEFT JOIN orders o
  ON o.customer_id = c.customer_id
 AND o.status = 'PAID'
GROUP BY c.customer_id
ORDER BY c.customer_id`,
      alt: `SELECT c.customer_id, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.customer_id AND o.status = 'PAID') AS paid_orders FROM customers c ORDER BY 1`,
      traps: [
        `SELECT c.customer_id, COUNT(o.order_id) AS paid_orders FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.status = 'PAID' GROUP BY c.customer_id ORDER BY 1`,
        `SELECT c.customer_id, COUNT(*) AS paid_orders FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status = 'PAID' GROUP BY c.customer_id ORDER BY 1`,
        `SELECT c.customer_id, COUNT(o.order_id) AS paid_orders FROM customers c JOIN orders o ON o.customer_id = c.customer_id AND o.status = 'PAID' GROUP BY c.customer_id ORDER BY 1`,
      ],
      explain: 'Three classic bugs in one task. A filter on the right-hand table in <code>WHERE</code> discards the NULL rows a LEFT JOIN added, silently turning it into an inner join. <code>COUNT(*)</code> counts those NULL rows as 1. Put right-hand filters in <code>ON</code>, and count a right-hand column.',
    },
    {
      id: 'never-ordered', level: 1, title: 'Customers who never ordered',
      scenario: 'Growth wants to email customers who signed up but never placed a single order.',
      task: 'Return <code>customer_id</code> and <code>full_name</code> of customers with no orders at all, in any status. Order by <code>customer_id</code>.',
      tables: ['customers', 'orders'], ordered: true,
      hints: ['Databricks has a join made for this: LEFT ANTI JOIN returns left rows with no match.'],
      solution: `SELECT c.customer_id, c.full_name
FROM customers c
LEFT ANTI JOIN orders o ON o.customer_id = c.customer_id
ORDER BY c.customer_id`,
      alt: `SELECT c.customer_id, c.full_name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id) ORDER BY 1`,
      traps: [`SELECT c.customer_id, c.full_name FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.status IS NULL AND o.status <> 'PAID' ORDER BY 1`],
      explain: '<code>LEFT ANTI JOIN</code> states the intent directly and never duplicates rows. <code>NOT EXISTS</code> is the portable equivalent. Both are safer than <code>NOT IN (subquery)</code>, which returns nothing if the subquery contains a single NULL.',
    },
    {
      id: 'events-with-refunds', level: 2, title: 'Events with refunds',
      scenario: 'Customer success is reviewing every event that had at least one refund.',
      task: 'Return <code>event_id</code> and <code>event_name</code> of events with at least one refund, <b>once each</b>. Order by <code>event_id</code>.',
      tables: ['events', 'orders', 'refunds'], ordered: true,
      hints: ['An inner join to refunds repeats the event once per refund.', 'LEFT SEMI JOIN keeps each left row at most once.'],
      solution: `SELECT e.event_id, e.event_name
FROM events e
LEFT SEMI JOIN (
  SELECT o.event_id
  FROM orders o
  JOIN refunds r ON r.order_id = o.order_id
) x ON x.event_id = e.event_id
ORDER BY e.event_id`,
      alt: `SELECT DISTINCT e.event_id, e.event_name FROM events e JOIN orders o ON o.event_id = e.event_id JOIN refunds r ON r.order_id = o.order_id ORDER BY 1`,
      traps: [`SELECT e.event_id, e.event_name FROM events e JOIN orders o ON o.event_id = e.event_id JOIN refunds r ON r.order_id = o.order_id ORDER BY 1`],
      explain: 'A semi join answers "does a match exist?" without multiplying rows, so there is nothing to DISTINCT away afterwards. Reaching for DISTINCT to fix duplicates often hides a join that should have been a semi join.',
    },
    {
      id: 'managers', level: 1, title: 'Who reports to whom',
      scenario: 'HR needs the org chart as a flat list.',
      task: 'Return each employee\'s <code>name</code>, <code>title</code> and their manager\'s name as <code>manager_name</code> (NULL for the CEO). Order by <code>employee_id</code>.',
      tables: ['employees'], ordered: true,
      hints: ['Join employees to itself, with two different aliases.', 'An inner join would drop the CEO.'],
      solution: `SELECT e.name, e.title, m.name AS manager_name
FROM employees e
LEFT JOIN employees m ON m.employee_id = e.manager_id
ORDER BY e.employee_id`,
      alt: `SELECT e.name, e.title, (SELECT m.name FROM employees m WHERE m.employee_id = e.manager_id) AS manager_name FROM employees e ORDER BY e.employee_id`,
      traps: [`SELECT e.name, e.title, m.name AS manager_name FROM employees e JOIN employees m ON m.employee_id = e.manager_id ORDER BY e.employee_id`],
      explain: 'A self join is an ordinary join where both sides happen to be the same table. Aliases make the two roles (employee, manager) explicit.',
    },
    {
      id: 'fx-range-join', level: 2, title: 'Convert PayPal payments to USD',
      scenario: 'PayPal settles Stagedoor\'s payments in EUR. Finance reports in USD, using the exchange rate valid on the day of the payment.',
      task: 'For payments with <code>method = \'paypal\'</code>, return <code>payment_id</code>, <code>amount</code> and <code>usd_amount</code> (amount × the EUR rate valid on the payment date, <b>rounded to 2 decimals</b>). A rate is valid from <code>valid_from</code> to <code>valid_to</code>, both inclusive. Order by <code>payment_id</code>.',
      tables: ['payments', 'fx_rates'], ordered: true,
      hints: ['Join on currency and on the date falling inside the range.', 'Compare a date with the payment date, not the timestamp: CAST(paid_ts AS DATE) or to_date(paid_ts).'],
      solution: `SELECT p.payment_id, p.amount, ROUND(p.amount * f.usd_rate, 2) AS usd_amount
FROM payments p
JOIN fx_rates f
  ON f.currency = 'EUR'
 AND CAST(p.paid_ts AS DATE) BETWEEN f.valid_from AND f.valid_to
WHERE p.method = 'paypal'
ORDER BY p.payment_id`,
      alt: `SELECT p.payment_id, p.amount, ROUND(p.amount * (SELECT usd_rate FROM fx_rates f WHERE f.currency = 'EUR' AND to_date(p.paid_ts) >= f.valid_from AND to_date(p.paid_ts) <= f.valid_to), 2) AS usd_amount FROM payments p WHERE p.method = 'paypal' ORDER BY 1`,
      traps: [`SELECT p.payment_id, p.amount, ROUND(p.amount * f.usd_rate, 2) AS usd_amount FROM payments p JOIN fx_rates f ON f.currency = 'EUR' AND p.paid_ts > f.valid_from AND p.paid_ts < f.valid_to WHERE p.method = 'paypal' ORDER BY 1`],
      explain: 'Range joins are common in finance and SCD lookups. Be precise about inclusive and exclusive bounds: comparing a timestamp such as <code>2025-06-30 14:00</code> with a date <code>valid_to = 2025-06-30</code> treats the date as midnight and drops the last day.',
    },
    {
      id: 'fanout-revenue', level: 2, title: 'Revenue per event is too high',
      scenario: 'A dashboard shows gross ticket revenue per event that is noticeably higher than finance\'s numbers. The query is in the editor.',
      task: 'Fix it. Return <code>event_id</code> and <code>revenue</code>: the sum of <code>quantity × unit_price</code> over the order lines of <b>PAID</b> orders, rounded to 2 decimals. Order by <code>event_id</code>.',
      tables: ['orders', 'order_items', 'payments'], ordered: true,
      starter: `-- Finance says these numbers are too high. Why?
SELECT o.event_id,
       ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
JOIN payments p ON p.order_id = o.order_id
WHERE o.status = 'PAID'
GROUP BY o.event_id
ORDER BY o.event_id`,
      hints: ['How many rows does an order with 2 lines and 2 payments produce after both joins?', 'Revenue comes from order lines. The payments join adds nothing but duplicates.'],
      solution: `SELECT o.event_id,
       ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
WHERE o.status = 'PAID'
GROUP BY o.event_id
ORDER BY o.event_id`,
      alt: `SELECT event_id, ROUND(SUM(line_total), 2) AS revenue FROM (SELECT o.event_id, i.quantity * i.unit_price AS line_total FROM orders o JOIN order_items i USING (order_id) WHERE o.status = 'PAID') GROUP BY ALL ORDER BY 1`,
      explain: 'This is join fan-out: joining two child tables (lines and payments) of the same parent multiplies their rows. Some orders were charged twice, so their lines were counted twice. Aggregate each child separately, or join only what the measure needs.',
    },
  ]);

  /* ===================== 3. Aggregation ===================== */
  add('aggregation', [
    {
      id: 'genre-revenue', level: 1, title: 'Revenue by genre',
      scenario: 'The programming team decides which genres to book more of.',
      task: 'For <b>PAID</b> orders, return <code>genre</code>, <code>orders</code> (number of distinct orders), <code>tickets</code> (sum of quantity) and <code>revenue</code> (sum of quantity × unit_price, rounded to 2). Order by revenue descending.',
      tables: ['orders', 'order_items', 'events'], ordered: true,
      hints: ['An order has several lines, so COUNT(*) counts lines, not orders.', 'GROUP BY ALL groups by every non-aggregated column in SELECT.'],
      solution: `SELECT e.genre,
       COUNT(DISTINCT o.order_id) AS orders,
       SUM(i.quantity) AS tickets,
       ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
JOIN events e ON e.event_id = o.event_id
WHERE o.status = 'PAID'
GROUP BY ALL
ORDER BY revenue DESC`,
      alt: `SELECT genre, COUNT(DISTINCT order_id) AS orders, SUM(quantity) AS tickets, ROUND(SUM(quantity * unit_price), 2) AS revenue FROM orders JOIN order_items USING (order_id) JOIN events USING (event_id) WHERE status = 'PAID' GROUP BY genre ORDER BY 4 DESC`,
      traps: [`SELECT e.genre, COUNT(*) AS orders, SUM(i.quantity) AS tickets, ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue FROM orders o JOIN order_items i ON i.order_id = o.order_id JOIN events e ON e.event_id = o.event_id WHERE o.status = 'PAID' GROUP BY ALL ORDER BY revenue DESC`],
      explain: '<code>GROUP BY ALL</code> is a Databricks convenience: it groups by every SELECT expression that is not an aggregate, so the grouping can never drift out of sync with the columns. Know your grain: after joining lines, <code>COUNT(*)</code> counts lines.',
    },
    {
      id: 'repeat-refunders', level: 1, title: 'Repeat refunders',
      scenario: 'Risk wants customers with two or more refunded orders.',
      task: 'Return <code>customer_id</code> and <code>refunded_orders</code> for customers with at least 2 REFUNDED orders. Order by refunded_orders descending, then customer_id.',
      tables: ['orders'], ordered: true,
      hints: ['WHERE filters rows before grouping; HAVING filters groups after.'],
      solution: `SELECT customer_id, COUNT(*) AS refunded_orders
FROM orders
WHERE status = 'REFUNDED'
GROUP BY customer_id
HAVING COUNT(*) >= 2
ORDER BY refunded_orders DESC, customer_id`,
      alt: `SELECT customer_id, count_if(status = 'REFUNDED') AS refunded_orders FROM orders GROUP BY ALL HAVING refunded_orders >= 2 ORDER BY 2 DESC, 1`,
      traps: [`SELECT customer_id, COUNT(*) AS refunded_orders FROM orders GROUP BY customer_id HAVING COUNT(*) >= 2 ORDER BY 2 DESC, 1`],
      explain: 'Databricks lets HAVING and QUALIFY refer to SELECT aliases (<code>HAVING refunded_orders &gt;= 2</code>). <code>count_if(condition)</code> counts rows where a condition is true, often clearer than <code>SUM(CASE …)</code>.',
    },
    {
      id: 'channel-scorecard', level: 2, title: 'Channel scorecard',
      scenario: 'The weekly business review compares channels on one row each.',
      task: 'Per <code>channel</code>, return <code>orders</code>, <code>paid</code>, <code>cancelled</code>, <code>refunded</code> (counts by status) and <code>paid_rate</code> = paid / orders, rounded to 3. Order by channel.',
      tables: ['orders'], ordered: true,
      hints: ['COUNT(*) FILTER (WHERE …) or count_if(…) builds one column per status.', 'Division in Databricks always returns a decimal or double, so there is no integer-division trap here.'],
      solution: `SELECT channel,
       COUNT(*) AS orders,
       COUNT(*) FILTER (WHERE status = 'PAID') AS paid,
       COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
       COUNT(*) FILTER (WHERE status = 'REFUNDED') AS refunded,
       ROUND(COUNT(*) FILTER (WHERE status = 'PAID') / COUNT(*), 3) AS paid_rate
FROM orders
GROUP BY channel
ORDER BY channel`,
      alt: `SELECT channel, COUNT(*) AS orders, count_if(status = 'PAID') AS paid, count_if(status = 'CANCELLED') AS cancelled, count_if(status = 'REFUNDED') AS refunded, ROUND(AVG(IF(status = 'PAID', 1, 0)), 3) AS paid_rate FROM orders GROUP BY ALL ORDER BY 1`,
      explain: 'Conditional aggregation pivots values into columns in a single pass. <code>AVG(IF(cond, 1, 0))</code> is a neat way to compute a rate directly.',
    },
    {
      id: 'monthly-activity', level: 2, title: 'Monthly activity',
      scenario: 'Product wants to know whether customers order more often, or whether there are simply more customers.',
      task: 'Per month of <code>order_ts</code> (formatted <code>yyyy-MM</code> as <code>month</code>), return <code>orders</code>, <code>customers</code> (distinct) and <code>orders_per_customer</code> rounded to 2. All statuses count. Order by month.',
      tables: ['orders'], ordered: true,
      hints: ["date_format(order_ts, 'yyyy-MM') gives the month as text that sorts correctly."],
      solution: `SELECT date_format(order_ts, 'yyyy-MM') AS month,
       COUNT(*) AS orders,
       COUNT(DISTINCT customer_id) AS customers,
       ROUND(COUNT(*) / COUNT(DISTINCT customer_id), 2) AS orders_per_customer
FROM orders
GROUP BY 1
ORDER BY 1`,
      alt: `SELECT month, COUNT(*) AS orders, COUNT(DISTINCT customer_id) AS customers, ROUND(COUNT(*) / COUNT(DISTINCT customer_id), 2) AS orders_per_customer FROM (SELECT date_format(date_trunc('MONTH', order_ts), 'yyyy-MM') AS month, customer_id FROM orders) GROUP BY ALL ORDER BY month`,
      explain: 'Ratios of distinct counts cannot be added across months: a customer active in two months is counted once per month. That is why such metrics are recomputed per period, never summed.',
    },
    {
      id: 'country-genre-rollup', level: 3, title: 'Subtotals with ROLLUP',
      scenario: 'Finance wants revenue by customer country and genre, with a subtotal per country and a grand total, in one result.',
      task: 'For PAID orders, return <code>country</code>, <code>genre</code> and <code>revenue</code> (rounded to 2), with subtotal rows (genre NULL) and a grand total (both NULL). Order by country, then genre, with NULLs last.',
      tables: ['orders', 'order_items', 'customers', 'events'], ordered: true,
      hints: ['GROUP BY ROLLUP (country, genre) produces (country, genre), (country) and () groupings.', 'ORDER BY … NULLS LAST puts subtotals after their details.'],
      solution: `SELECT c.country, e.genre, ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
JOIN customers c ON c.customer_id = o.customer_id
JOIN events e ON e.event_id = o.event_id
WHERE o.status = 'PAID'
GROUP BY ROLLUP (c.country, e.genre)
ORDER BY c.country NULLS LAST, e.genre NULLS LAST`,
      alt: `WITH base AS (SELECT c.country, e.genre, i.quantity * i.unit_price AS amt FROM orders o JOIN order_items i USING (order_id) JOIN customers c USING (customer_id) JOIN events e USING (event_id) WHERE o.status = 'PAID')
SELECT country, genre, ROUND(SUM(amt), 2) AS revenue FROM base GROUP BY country, genre
UNION ALL SELECT country, NULL, ROUND(SUM(amt), 2) FROM base GROUP BY country
UNION ALL SELECT NULL, NULL, ROUND(SUM(amt), 2) FROM base
ORDER BY country NULLS LAST, genre NULLS LAST`,
      explain: 'ROLLUP replaces several UNION ALL queries with one pass. If a grouping column can itself be NULL, use <code>grouping(col)</code> to tell a real NULL apart from a subtotal row.',
    },
    {
      id: 'last-channel', level: 2, title: 'Each customer\'s latest channel',
      scenario: 'CRM personalises messages by the channel a customer used most recently.',
      task: 'For each customer with orders, return <code>customer_id</code>, <code>last_order_ts</code> and <code>last_channel</code> (the channel of their most recent order). Order by customer_id.',
      tables: ['orders'], ordered: true,
      hints: ['max_by(value, ordering) returns the value from the row with the largest ordering.', 'A window function with QUALIFY also works.'],
      solution: `SELECT customer_id,
       MAX(order_ts) AS last_order_ts,
       max_by(channel, order_ts) AS last_channel
FROM orders
GROUP BY customer_id
ORDER BY customer_id`,
      alt: `SELECT customer_id, order_ts AS last_order_ts, channel AS last_channel FROM orders QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_ts DESC) = 1 ORDER BY customer_id`,
      traps: [`SELECT customer_id, MAX(order_ts) AS last_order_ts, MAX(channel) AS last_channel FROM orders GROUP BY customer_id ORDER BY customer_id`],
      explain: '<code>MAX(channel)</code> returns the alphabetically largest channel, not the latest one. <code>max_by</code> and <code>min_by</code> pick a value by another column, avoiding a self join or a window.',
    },
    {
      id: 'price-percentiles', level: 2, title: 'Ticket price distribution',
      scenario: 'Pricing wants the typical price and the high end per ticket type, not averages skewed by outliers.',
      task: 'Per <code>ticket_type</code>, return <code>median_price</code> and <code>p90_price</code> (the 90th percentile, linear interpolation) of <code>unit_price</code>, both rounded to 2. Order by ticket_type.',
      tables: ['order_items'], ordered: true,
      hints: ['percentile(col, 0.9) interpolates between values; median(col) is percentile 0.5.'],
      solution: `SELECT ticket_type,
       ROUND(median(unit_price), 2) AS median_price,
       ROUND(percentile(unit_price, 0.9), 2) AS p90_price
FROM order_items
GROUP BY ticket_type
ORDER BY ticket_type`,
      alt: `SELECT ticket_type, ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_price), 2) AS median_price, ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY unit_price), 2) AS p90_price FROM order_items GROUP BY ALL ORDER BY 1`,
      explain: 'On large data, <code>percentile_approx</code> is much cheaper and returns an actual value from the data. Exact <code>percentile</code> and <code>percentile_cont</code> interpolate between values.',
    },
  ]);

  /* ===================== 4. Window functions ===================== */
  add('windows', [
    {
      id: 'top-events-per-genre', level: 2, title: 'Top 2 events per genre',
      scenario: 'The homepage shows the two best-selling concerts in each genre.',
      task: 'For PAID orders, return <code>genre</code>, <code>event_id</code>, <code>tickets</code> (sum of quantity) and <code>rank</code> (1 or 2) for the top 2 events per genre by tickets. Break ties by the lower event_id. Order by genre, then rank.',
      tables: ['orders', 'order_items', 'events'], ordered: true,
      hints: ['Aggregate first, then rank with ROW_NUMBER() OVER (PARTITION BY genre ORDER BY …).', 'QUALIFY filters on a window function without a subquery.'],
      solution: `SELECT e.genre, o.event_id, SUM(i.quantity) AS tickets,
       ROW_NUMBER() OVER (PARTITION BY e.genre ORDER BY SUM(i.quantity) DESC, o.event_id) AS rank
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
JOIN events e ON e.event_id = o.event_id
WHERE o.status = 'PAID'
GROUP BY e.genre, o.event_id
QUALIFY rank <= 2
ORDER BY e.genre, rank`,
      alt: `WITH t AS (SELECT genre, event_id, SUM(quantity) AS tickets FROM orders JOIN order_items USING (order_id) JOIN events USING (event_id) WHERE status = 'PAID' GROUP BY ALL), r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY genre ORDER BY tickets DESC, event_id) AS rank FROM t) SELECT * FROM r WHERE rank <= 2 ORDER BY genre, rank`,
      explain: '<code>QUALIFY</code> is to window functions what HAVING is to aggregates. Always give a ranking a deterministic tie-breaker, or the "top 2" can change between runs.',
    },
    {
      id: 'latest-order', level: 1, title: 'Latest order per customer',
      scenario: 'Support wants each customer\'s most recent order on their screen.',
      task: 'Return <code>customer_id</code>, <code>order_id</code>, <code>order_ts</code> and <code>status</code> of each customer\'s most recent order. Order by customer_id.',
      tables: ['orders'], ordered: true,
      hints: ['ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_ts DESC) = 1, filtered with QUALIFY.'],
      solution: `SELECT customer_id, order_id, order_ts, status
FROM orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_ts DESC, order_id DESC) = 1
ORDER BY customer_id`,
      alt: `SELECT o.customer_id, o.order_id, o.order_ts, o.status FROM orders o WHERE o.order_ts = (SELECT MAX(i.order_ts) FROM orders i WHERE i.customer_id = o.customer_id) ORDER BY 1`,
      explain: 'Latest-row-per-key is the most common deduplication pattern in pipelines. On Databricks, <code>QUALIFY ROW_NUMBER() … = 1</code> is the idiom: one pass, no self join.',
    },
    {
      id: 'running-revenue', level: 2, title: 'Running revenue in January',
      scenario: 'The finance team tracks January 2026 revenue against target day by day.',
      task: 'For PAID orders placed in January 2026, return <code>day</code> (a DATE), <code>revenue</code> that day and <code>running_revenue</code> (month to date), both rounded to 2. Order by day.',
      tables: ['orders', 'order_items'], ordered: true,
      hints: ['First aggregate per day, then SUM(revenue) OVER (ORDER BY day).', 'A window can wrap an aggregate: SUM(SUM(x)) OVER (…).'],
      solution: `SELECT CAST(o.order_ts AS DATE) AS day,
       ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue,
       ROUND(SUM(SUM(i.quantity * i.unit_price)) OVER (ORDER BY CAST(o.order_ts AS DATE)), 2) AS running_revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
WHERE o.status = 'PAID'
  AND o.order_ts >= '2026-01-01' AND o.order_ts < '2026-02-01'
GROUP BY 1
ORDER BY 1`,
      alt: `WITH d AS (SELECT to_date(order_ts) AS day, SUM(quantity * unit_price) AS rev FROM orders JOIN order_items USING (order_id) WHERE status = 'PAID' AND date_format(order_ts, 'yyyy-MM') = '2026-01' GROUP BY 1) SELECT day, ROUND(rev, 2) AS revenue, ROUND(SUM(rev) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 2) AS running_revenue FROM d ORDER BY day`,
      explain: 'Round at the end, not before summing: rounding each day first and then accumulating can drift by cents. With ORDER BY and no frame, a window defaults to RANGE UNBOUNDED PRECEDING to the current row, which includes ties.',
    },
    {
      id: 'mom-growth', level: 2, title: 'Month-over-month growth',
      scenario: 'The board deck needs monthly paid revenue and growth versus the previous month.',
      task: 'Return <code>month</code> (<code>yyyy-MM</code>), <code>revenue</code>, <code>prev_revenue</code> and <code>growth_pct</code> = (revenue − prev) / prev × 100 rounded to 1, for PAID orders. Round revenues to 2. The first month has NULL growth. Order by month.',
      tables: ['orders', 'order_items'], ordered: true,
      hints: ['LAG(revenue) OVER (ORDER BY month) gives the previous month.', 'Compute growth from unrounded values, then round.'],
      solution: `WITH m AS (
  SELECT date_format(o.order_ts, 'yyyy-MM') AS month, SUM(i.quantity * i.unit_price) AS revenue
  FROM orders o JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'PAID'
  GROUP BY 1
)
SELECT month,
       ROUND(revenue, 2) AS revenue,
       ROUND(LAG(revenue) OVER (ORDER BY month), 2) AS prev_revenue,
       ROUND((revenue - LAG(revenue) OVER (ORDER BY month)) / LAG(revenue) OVER (ORDER BY month) * 100, 1) AS growth_pct
FROM m
ORDER BY month`,
      alt: `WITH m AS (SELECT date_format(order_ts, 'yyyy-MM') AS month, SUM(quantity * unit_price) AS revenue FROM orders JOIN order_items USING (order_id) WHERE status = 'PAID' GROUP BY 1), l AS (SELECT month, revenue, LAG(revenue) OVER w AS prev FROM m WINDOW w AS (ORDER BY month)) SELECT month, ROUND(revenue, 2) AS revenue, ROUND(prev, 2) AS prev_revenue, ROUND(100 * (revenue / prev - 1), 1) AS growth_pct FROM l ORDER BY month`,
      explain: 'LAG reads the previous row in window order. This assumes every month has sales; if one month were missing, LAG would compare against two months ago. The time series track shows how to zero-fill first.',
    },
    {
      id: 'moving-average', level: 2, title: 'Smoothing the seat count',
      scenario: 'The demand-forecasting model uses a 3-snapshot moving average of remaining seats.',
      task: 'For event 101, return <code>snapshot_date</code>, <code>seats_remaining</code> and <code>moving_avg</code>: the average of the current and two previous snapshots, rounded to 1. Order by snapshot_date.',
      tables: ['seat_inventory'], ordered: true,
      hints: ['ROWS BETWEEN 2 PRECEDING AND CURRENT ROW.'],
      solution: `SELECT snapshot_date, seats_remaining,
       ROUND(AVG(seats_remaining) OVER (ORDER BY snapshot_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 1) AS moving_avg
FROM seat_inventory
WHERE event_id = 101
ORDER BY snapshot_date`,
      alt: `SELECT snapshot_date, seats_remaining, ROUND((seats_remaining + coalesce(LAG(seats_remaining, 1) OVER w, 0) + coalesce(LAG(seats_remaining, 2) OVER w, 0)) / (1 + IF(LAG(seats_remaining, 1) OVER w IS NULL, 0, 1) + IF(LAG(seats_remaining, 2) OVER w IS NULL, 0, 1)), 1) AS moving_avg FROM seat_inventory WHERE event_id = 101 WINDOW w AS (ORDER BY snapshot_date) ORDER BY 1`,
      explain: 'ROWS counts rows; RANGE counts values. Snapshots are missing on some days here, so "the last 3 rows" is not "the last 3 days". For a true 3-day window, zero-fill the dates first or use a RANGE frame on a numeric day number.',
    },
    {
      id: 'venue-share', level: 2, title: 'Share of tickets by venue',
      scenario: 'Partnerships negotiates with venues using their share of all paid tickets.',
      task: 'Return the venue <code>name</code>, <code>tickets</code> (paid) and <code>share_pct</code> = 100 × tickets / all paid tickets, rounded to 1. Order by share_pct descending, then name.',
      tables: ['orders', 'order_items', 'events', 'venues'], ordered: true,
      hints: ['SUM(SUM(quantity)) OVER () is the grand total next to each group.'],
      solution: `SELECT v.name, SUM(i.quantity) AS tickets,
       ROUND(100 * SUM(i.quantity) / SUM(SUM(i.quantity)) OVER (), 1) AS share_pct
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
JOIN events e ON e.event_id = o.event_id
JOIN venues v ON v.venue_id = e.venue_id
WHERE o.status = 'PAID'
GROUP BY v.name
ORDER BY share_pct DESC, v.name`,
      alt: `WITH t AS (SELECT v.name, SUM(i.quantity) AS tickets FROM orders o JOIN order_items i USING (order_id) JOIN events e USING (event_id) JOIN venues v ON v.venue_id = e.venue_id WHERE o.status = 'PAID' GROUP BY ALL) SELECT name, tickets, ROUND(100 * tickets / (SELECT SUM(tickets) FROM t), 1) AS share_pct FROM t ORDER BY 3 DESC, 1`,
      explain: 'An empty <code>OVER ()</code> is the whole result set, computed after grouping. Shares rounded independently may not add up to exactly 100; that is expected.',
    },
    {
      id: 'spend-quartiles', level: 2, title: 'Spend quartiles',
      scenario: 'Marketing segments paying customers into four equal-sized groups by lifetime spend.',
      task: 'For customers with at least one PAID order, return <code>customer_id</code>, <code>spend</code> (rounded to 2) and <code>quartile</code> (1 = top spenders) using NTILE(4), ordered by spend descending with ties broken by customer_id. Order the output by customer_id.',
      tables: ['orders', 'order_items'], ordered: true,
      hints: ['NTILE(4) OVER (ORDER BY spend DESC, customer_id).'],
      solution: `WITH s AS (
  SELECT o.customer_id, SUM(i.quantity * i.unit_price) AS spend
  FROM orders o JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'PAID'
  GROUP BY o.customer_id
)
SELECT customer_id, ROUND(spend, 2) AS spend,
       NTILE(4) OVER (ORDER BY spend DESC, customer_id) AS quartile
FROM s
ORDER BY customer_id`,
      alt: `SELECT o.customer_id, ROUND(SUM(i.quantity * i.unit_price), 2) AS spend, NTILE(4) OVER (ORDER BY SUM(i.quantity * i.unit_price) DESC, o.customer_id) AS quartile FROM orders o JOIN order_items i USING (order_id) WHERE o.status = 'PAID' GROUP BY o.customer_id ORDER BY 1`,
      explain: 'NTILE splits rows into equal-count buckets; earlier buckets get the extra rows when the count does not divide evenly. For value-based bands, use percentiles or CASE instead.',
    },
    {
      id: 'days-between-orders', level: 3, title: 'How often do loyal customers buy?',
      scenario: 'The loyalty team wants the average gap between consecutive orders for frequent buyers.',
      task: 'For customers with <b>at least 10 orders</b> (any status), return <code>customer_id</code>, <code>orders</code> and <code>avg_days_between</code>: the average number of days between each order and the previous one (by calendar date, using datediff), rounded to 1. Order by customer_id.',
      tables: ['orders'], ordered: true,
      hints: ['datediff(order_ts, LAG(order_ts) OVER (PARTITION BY customer_id ORDER BY order_ts)).', 'AVG ignores the NULL produced for each customer\'s first order.'],
      solution: `WITH gaps AS (
  SELECT customer_id,
         datediff(order_ts, LAG(order_ts) OVER (PARTITION BY customer_id ORDER BY order_ts)) AS gap
  FROM orders
)
SELECT customer_id, COUNT(*) AS orders, ROUND(AVG(gap), 1) AS avg_days_between
FROM gaps
GROUP BY customer_id
HAVING COUNT(*) >= 10
ORDER BY customer_id`,
      alt: `SELECT customer_id, COUNT(*) AS orders, ROUND(AVG(gap), 1) AS avg_days_between FROM (SELECT customer_id, datediff(order_ts, LAG(order_ts) OVER (PARTITION BY customer_id ORDER BY order_ts)) AS gap, COUNT(*) OVER (PARTITION BY customer_id) AS n FROM orders) WHERE n >= 10 GROUP BY customer_id ORDER BY 1`,
      explain: 'Window functions run after WHERE, so filtering customers before computing LAG would remove orders and change the gaps. Compute the window over all rows, then filter on the aggregate.',
    },
  ]);

  /* ===================== 5. Data quality ===================== */
  add('quality', [
    {
      id: 'duplicate-charges', level: 2, title: 'Customers charged twice',
      scenario: 'A payment-gateway retry bug charged some customers twice. Finance needs the list to issue refunds.',
      task: 'For orders with more than one <b>SETTLED</b> payment, return <code>order_id</code>, <code>charges</code>, <code>total_charged</code> and <code>overcharge</code> (total minus a single charge), amounts rounded to 2. Order by order_id.',
      tables: ['payments'], ordered: true,
      hints: ['GROUP BY order_id, HAVING COUNT(*) > 1.', 'Duplicate charges have the same amount, so a single charge is MIN(amount).'],
      solution: `SELECT order_id,
       COUNT(*) AS charges,
       ROUND(SUM(amount), 2) AS total_charged,
       ROUND(SUM(amount) - MIN(amount), 2) AS overcharge
FROM payments
WHERE status = 'SETTLED'
GROUP BY order_id
HAVING COUNT(*) > 1
ORDER BY order_id`,
      alt: `SELECT order_id, COUNT(*) AS charges, ROUND(SUM(amount), 2) AS total_charged, ROUND(SUM(amount) - MIN(amount), 2) AS overcharge FROM payments WHERE status = 'SETTLED' GROUP BY ALL QUALIFY COUNT(*) > 1 ORDER BY 1`,
      traps: [`SELECT order_id, COUNT(*) AS charges, ROUND(SUM(amount), 2) AS total_charged, ROUND(SUM(amount) - MIN(amount), 2) AS overcharge FROM payments GROUP BY order_id HAVING COUNT(*) > 1 ORDER BY order_id`],
      explain: 'Failed payment attempts are not charges, which is why the status filter matters. Writing this check as a scheduled query with an alert turns a support incident into a dashboard tile.',
    },
    {
      id: 'clean-signups', level: 3, title: 'Clean the raw sign-ups',
      scenario: 'The sign-up form wrote raw text: stray spaces, mixed case, invalid emails and the same person twice.',
      task: 'Return <code>signup_id</code>, <code>email</code> (trimmed, lower case), <code>full_name</code> (initcap, with runs of spaces collapsed to one) and <code>country</code> (trimmed, upper case). Keep only valid emails, matching <code>^[^@ ]+@[^@ ]+[.][a-z]+$</code> after cleaning, and keep one row per email: the lowest signup_id. Order by signup_id.',
      tables: ['raw_signups'], ordered: true,
      hints: ["regexp_replace(full_name, ' +', ' ') collapses spaces; initcap capitalizes words.", 'RLIKE matches a regular expression.', 'Deduplicate with QUALIFY ROW_NUMBER() OVER (PARTITION BY email ORDER BY signup_id) = 1.'],
      solution: `WITH clean AS (
  SELECT signup_id,
         lower(trim(email)) AS email,
         initcap(regexp_replace(trim(full_name), ' +', ' ')) AS full_name,
         upper(trim(country)) AS country
  FROM raw_signups
)
SELECT *
FROM clean
WHERE email RLIKE '^[^@ ]+@[^@ ]+[.][a-z]+$'
QUALIFY ROW_NUMBER() OVER (PARTITION BY email ORDER BY signup_id) = 1
ORDER BY signup_id`,
      alt: `SELECT signup_id, email, full_name, country FROM (SELECT signup_id, lower(trim(email)) AS email, initcap(regexp_replace(trim(full_name), ' +', ' ')) AS full_name, upper(trim(country)) AS country, MIN(signup_id) OVER (PARTITION BY lower(trim(email))) AS first_id FROM raw_signups) WHERE signup_id = first_id AND regexp_like(email, '^[^@ ]+@[^@ ]+[.][a-z]+$') ORDER BY 1`,
      traps: [`SELECT signup_id, lower(trim(email)) AS email, initcap(full_name) AS full_name, upper(trim(country)) AS country FROM raw_signups WHERE email LIKE '%@%' ORDER BY signup_id`],
      explain: 'Standardize before you deduplicate: <code>\' Amara.Okafor1@Example.com \'</code> and <code>\'AMARA.OKAFOR1@EXAMPLE.COM\'</code> are the same person only after trimming and lower-casing. Keep the raw table untouched, and write the cleaned version to Silver.',
    },
    {
      id: 'parse-dates', level: 3, title: 'Dates in three formats',
      scenario: 'The same raw sign-ups store dates as ISO strings, ISO timestamps, or European <code>dd/MM/yyyy</code>, plus some garbage.',
      task: 'Return <code>signup_id</code>, the raw <code>signup_date</code> as <code>raw</code>, and <code>signup_day</code>: a DATE parsed from ISO (<code>yyyy-MM-dd</code>, optionally followed by a time) or <code>dd/MM/yyyy</code>, and NULL when it is neither or not a real date. The query must not fail. Order by signup_id.',
      tables: ['raw_signups'], ordered: true,
      hints: ['try_cast(x AS DATE) returns NULL instead of raising CAST_INVALID_INPUT.', "try_to_timestamp(x, 'dd/MM/yyyy') parses the European form; cast the result to DATE.", 'coalesce() takes the first non-NULL attempt.'],
      solution: `SELECT signup_id,
       signup_date AS raw,
       coalesce(try_cast(signup_date AS DATE),
                CAST(try_to_timestamp(signup_date, 'dd/MM/yyyy') AS DATE)) AS signup_day
FROM raw_signups
ORDER BY signup_id`,
      alt: `SELECT signup_id, signup_date AS raw, CASE WHEN signup_date RLIKE '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(try_to_timestamp(signup_date, 'dd/MM/yyyy')) ELSE try_cast(signup_date AS DATE) END AS signup_day FROM raw_signups ORDER BY 1`,
      traps: [`SELECT signup_id, signup_date AS raw, try_cast(signup_date AS DATE) AS signup_day FROM raw_signups ORDER BY signup_id`],
      explain: 'With ANSI mode on, the default on Databricks SQL warehouses, <code>CAST</code> of a malformed value fails the whole query. <code>try_cast</code> and <code>try_to_timestamp</code> return NULL instead, so one bad row cannot break a pipeline. Count the NULLs afterwards to monitor how much is unparseable.',
    },
    {
      id: 'orphan-refunds', level: 1, title: 'Refunds for orders that don\'t exist',
      scenario: 'A reconciliation job flagged refunds that point at no order.',
      task: 'Return <code>refund_id</code>, <code>order_id</code> and <code>amount</code> of refunds whose order is not in <code>orders</code>. Order by refund_id.',
      tables: ['refunds', 'orders'], ordered: true,
      hints: ['LEFT ANTI JOIN, or NOT EXISTS.'],
      solution: `SELECT r.refund_id, r.order_id, r.amount
FROM refunds r
LEFT ANTI JOIN orders o ON o.order_id = r.order_id
ORDER BY r.refund_id`,
      alt: `SELECT r.refund_id, r.order_id, r.amount FROM refunds r LEFT JOIN orders o ON o.order_id = r.order_id WHERE o.order_id IS NULL ORDER BY 1`,
      explain: 'Delta Lake foreign keys are informational, not enforced, so orphans like this can exist. Checks like this one belong in pipeline tests or expectations.',
    },
    {
      id: 'referral-timing', level: 2, title: 'Impossible referrals',
      scenario: 'A customer cannot be referred by someone who signed up after them. Data engineering suspects the referral import.',
      task: 'Return <code>customer_id</code>, <code>signup_date</code>, <code>referred_by</code> and <code>referrer_signup</code> for customers whose referrer signed up <b>after</b> them. Order by customer_id.',
      tables: ['customers'], ordered: true,
      hints: ['Self join customers to their referrer.'],
      solution: `SELECT c.customer_id, c.signup_date, c.referred_by, r.signup_date AS referrer_signup
FROM customers c
JOIN customers r ON r.customer_id = c.referred_by
WHERE r.signup_date > c.signup_date
ORDER BY c.customer_id`,
      alt: `SELECT customer_id, signup_date, referred_by, referrer_signup FROM (SELECT c.*, (SELECT r.signup_date FROM customers r WHERE r.customer_id = c.referred_by) AS referrer_signup FROM customers c) WHERE referrer_signup > signup_date ORDER BY 1`,
      explain: 'Cross-row consistency rules like this are invisible to column-level checks (NOT NULL, ranges). They are worth encoding as tests because they catch broken imports.',
    },
    {
      id: 'promo-changes', level: 3, title: 'Did the promo code change?',
      scenario: 'Marketing wants to know how often a customer\'s order uses a different promo code than their previous order. NULL means "no code", and going from no code to a code counts as a change.',
      task: 'Return one column, <code>changes</code>: the number of orders whose promo_code differs from the same customer\'s previous order (by order_ts), comparing NULLs safely. A customer\'s first order is not a change.',
      tables: ['orders'],
      hints: ['LAG(promo_code) OVER (PARTITION BY customer_id ORDER BY order_ts).', 'a <> b is NULL when either side is NULL. NOT (a <=> b) or a IS DISTINCT FROM b treats NULLs as comparable values.', 'How do you exclude the first order, where there is no previous row?'],
      solution: `SELECT count_if(rn > 1 AND promo_code IS DISTINCT FROM prev) AS changes
FROM (
  SELECT promo_code,
         LAG(promo_code) OVER (PARTITION BY customer_id ORDER BY order_ts) AS prev,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_ts) AS rn
  FROM orders
)`,
      alt: `SELECT COUNT(*) AS changes FROM (SELECT promo_code, LAG(promo_code) OVER w AS prev, LAG(order_id) OVER w AS prev_order FROM orders WINDOW w AS (PARTITION BY customer_id ORDER BY order_ts)) WHERE prev_order IS NOT NULL AND NOT (promo_code <=> prev)`,
      traps: [`SELECT count_if(promo_code <> prev) AS changes FROM (SELECT promo_code, LAG(promo_code) OVER (PARTITION BY customer_id ORDER BY order_ts) AS prev FROM orders)`, `SELECT count_if(promo_code IS DISTINCT FROM prev) AS changes FROM (SELECT promo_code, LAG(promo_code) OVER (PARTITION BY customer_id ORDER BY order_ts) AS prev FROM orders)`],
      explain: 'Two traps. <code>&lt;&gt;</code> ignores every change to or from NULL. And LAG returns NULL both for "previous order had no code" and for "there is no previous order"; telling them apart needs a row number (or the previous row\'s key).',
    },
  ]);
})(typeof window !== 'undefined' ? window : global);
