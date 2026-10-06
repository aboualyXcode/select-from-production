-- Hierarchies · Hard · Total headcount per manager
-- Playground: https://aboualyxcode.github.io/select-from-production/#headcount
--
-- Finance allocates budget by the total number of people in each manager's organization, direct
-- and indirect.
--
-- TASK: For every employee with at least one report, return `name` and `headcount` (everyone below
-- them, at any depth). Order by headcount descending, then name.
--
-- Tables: employees

USE SCHEMA stagedoor;

-- Reference solution
WITH RECURSIVE reports AS (
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
ORDER BY headcount DESC, m.name;

-- Another way
WITH RECURSIVE chain AS (SELECT employee_id, name AS path FROM employees WHERE manager_id IS NULL UNION ALL SELECT e.employee_id, c.path || ' > ' || e.name FROM employees e JOIN chain c ON e.manager_id = c.employee_id) SELECT m.name, COUNT(*) AS headcount FROM employees m JOIN chain c ON c.path LIKE '%' || m.name || ' > %' GROUP BY m.name ORDER BY 2 DESC, 1;

-- WHY IT MATTERS: Materializing (ancestor, descendant) pairs, sometimes called a closure table,
-- turns every "everyone under X" question into a simple join and GROUP BY.
