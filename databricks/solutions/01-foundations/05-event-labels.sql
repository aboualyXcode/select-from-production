-- Foundations · Warm-up · Event labels for the app
-- Playground: https://aboualyxcode.github.io/select-from-production/#event-labels
--
-- The mobile app shows each event as a one-line label, for example `AURORA VALE | 14 May 2025`.
--
-- TASK: Return `event_id` and `label`: the artist in upper case, a space, a pipe, a space, and the
-- event date formatted `dd MMM yyyy`. Order by `event_date`, then `event_id`.
--
-- Tables: events

USE SCHEMA stagedoor;

-- Reference solution
SELECT event_id,
       upper(artist) || ' | ' || date_format(event_date, 'dd MMM yyyy') AS label
FROM events
ORDER BY event_date, event_id;

-- Another way
SELECT event_id, concat(upper(artist), ' | ', date_format(event_date, 'dd MMM yyyy')) AS label FROM events ORDER BY event_date, event_id;

-- WHY IT MATTERS: Pattern letters are case-sensitive: `MM` is month, `mm` is minutes, `dd` is day
-- of month and `DD` is day of year. A wrong-case pattern often still runs and quietly returns
-- nonsense.
