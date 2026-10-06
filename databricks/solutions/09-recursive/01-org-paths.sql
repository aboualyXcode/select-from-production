-- Hierarchies · Core · Everyone's chain of command
-- Playground: https://aboualyxcode.github.io/select-from-production/#org-paths
--
-- The new HR portal shows each employee's level and full reporting line.
--
-- TASK: Return `employee_id`, `name`, `level` (CEO = 0) and `path`: names from the CEO down to the
-- employee, separated by ` > `. Order by employee_id.
--
-- Tables: employees

USE SCHEMA stagedoor;

-- Reference solution
WITH RECURSIVE chain AS (
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
ORDER BY employee_id;

-- Another way
SELECT e.employee_id, e.name, (CASE WHEN m1.name IS NULL THEN 0 ELSE 1 END + CASE WHEN m2.name IS NULL THEN 0 ELSE 1 END + CASE WHEN m3.name IS NULL THEN 0 ELSE 1 END + CASE WHEN m4.name IS NULL THEN 0 ELSE 1 END) AS level, concat_ws(' > ', m4.name, m3.name, m2.name, m1.name, e.name) AS path FROM employees e LEFT JOIN employees m1 ON m1.employee_id = e.manager_id LEFT JOIN employees m2 ON m2.employee_id = m1.manager_id LEFT JOIN employees m3 ON m3.employee_id = m2.manager_id LEFT JOIN employees m4 ON m4.employee_id = m3.manager_id ORDER BY 1;

-- WHY IT MATTERS: A recursive CTE walks a hierarchy of any depth; the chain of self joins in the
-- alternative only works up to a fixed depth. Recursive CTEs are available on recent Databricks
-- runtimes and SQL warehouses; always make sure the recursion terminates.
