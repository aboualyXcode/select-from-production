-- Hierarchies · Hard · Who started the referral chain?
-- Playground: https://aboualyxcode.github.io/select-from-production/#referral-roots
--
-- Marketing rewards customers whose referrals went at least two levels deep.
--
-- TASK: For customers at depth 2 or more in a referral chain (referred by someone who was
-- themselves referred), return `customer_id`, `root_id` (the customer at the top of the chain, who
-- was referred by no one) and `depth`. Order by customer_id.
--
-- Tables: customers

USE SCHEMA stagedoor;

-- Reference solution
WITH RECURSIVE chain AS (
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
ORDER BY customer_id;

-- Another way
WITH RECURSIVE up AS (SELECT customer_id, customer_id AS cur, referred_by AS nxt, 0 AS depth FROM customers UNION ALL SELECT u.customer_id, c.customer_id, c.referred_by, u.depth + 1 FROM up u JOIN customers c ON c.customer_id = u.nxt) SELECT customer_id, cur AS root_id, depth FROM up WHERE nxt IS NULL AND depth >= 2 ORDER BY 1;

-- WHY IT MATTERS: The solution walks down from the roots; the alternative walks up from every
-- customer. Both are valid. Walking down is cheaper when there are few roots, and walking up when
-- you only need a few customers' ancestry.
