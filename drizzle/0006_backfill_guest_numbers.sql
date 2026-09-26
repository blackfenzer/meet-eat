-- Rows that existed before guest_number did all took the column default, so
-- every one of them is "Guest 1" and anonymous mode cannot tell them apart.
-- Number them by join order, then set each session's counter to match.
WITH ordered AS (
  SELECT id, row_number() OVER (
    PARTITION BY session_id ORDER BY created_at, id
  ) AS n
  FROM participants
)
UPDATE participants p
SET guest_number = o.n
FROM ordered o
WHERE p.id = o.id;
--> statement-breakpoint
UPDATE sessions s
SET guest_counter = COALESCE(
  (SELECT max(guest_number) FROM participants p WHERE p.session_id = s.id), 0
);
