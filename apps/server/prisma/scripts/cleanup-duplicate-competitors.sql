-- =============================================================================
-- Cleanup: duplicate Competitor rows with the same (classId, externalId).
-- =============================================================================
--
-- Why: prior to the @@unique([classId, externalId]) constraint, the IOF upload
-- pipeline could produce duplicate competitor rows under concurrent writes
-- (forEachWithConcurrency in upload.competitor.ts). This script merges each
-- duplicate group into a single "winner" row, preserving splits and protocol
-- audit trail, and deletes the loser rows.
--
-- Run BEFORE the unique constraint migration. The migration will fail otherwise
-- with: Duplicate entry '...' for key 'Competitor_class_external_uq'.
--
-- USAGE:
--   1. Take a database backup. This script DELETES rows.
--   2. Connect to the production DB:
--        mysql -u <user> -p <database>
--   3. Source this file:
--        SOURCE /path/to/cleanup-duplicate-competitors.sql;
--   4. Inspect the output. Each step prints affected row counts.
--   5. If the final verification query returns 0 rows, run:
--        COMMIT;
--      Otherwise:
--        ROLLBACK;
--
-- IMPORTANT: this script does NOT auto-commit. You decide based on output.
--
-- Winner selection rule (applied per (classId, externalId) group):
--   1. Row with the most splits (most "real" data).
--   2. Tiebreak: most recent updatedAt.
--   3. Tiebreak: highest competitor.id (most recent insert).
--
-- Preserved on merge:
--   - Loser splits are re-pointed to the winner UNLESS the winner already has a
--     split for the same controlCode (in that case the loser split is dropped
--     to avoid duplicating per-control measurements).
--   - Loser protocol rows are re-pointed to the winner. Audit trail survives.
--
-- Lost on merge:
--   - Loser competitor row metadata (firstname/lastname/etc.) is discarded.
--     The winner already holds these or a more complete version of them.
-- =============================================================================

START TRANSACTION;

-- -----------------------------------------------------------------------------
-- Snapshot: before
-- -----------------------------------------------------------------------------
SELECT '=== BEFORE ===' AS step;

SELECT
  COUNT(*) AS duplicate_groups,
  SUM(dup_count - 1) AS rows_to_remove,
  MAX(dup_count) AS largest_group
FROM (
  SELECT classId, externalId, COUNT(*) AS dup_count
  FROM Competitor
  WHERE externalId IS NOT NULL
  GROUP BY classId, externalId
  HAVING COUNT(*) > 1
) t;

-- -----------------------------------------------------------------------------
-- Step 1: build merge plan (winner ↔ loser mapping)
-- -----------------------------------------------------------------------------
SELECT '=== STEP 1: build merge plan ===' AS step;

DROP TEMPORARY TABLE IF EXISTS _competitor_merge_plan;
CREATE TEMPORARY TABLE _competitor_merge_plan (
  loser_id  INT UNSIGNED NOT NULL PRIMARY KEY,
  winner_id INT UNSIGNED NOT NULL,
  KEY idx_winner (winner_id)
);

INSERT INTO _competitor_merge_plan (loser_id, winner_id)
SELECT l.id, w.id
FROM (
  SELECT
    c.id, c.classId, c.externalId,
    ROW_NUMBER() OVER (
      PARTITION BY c.classId, c.externalId
      ORDER BY
        (SELECT COUNT(*) FROM Split s WHERE s.competitorId = c.id) DESC,
        c.updatedAt DESC,
        c.id DESC
    ) AS rn
  FROM Competitor c
  WHERE c.externalId IS NOT NULL
) l
JOIN (
  SELECT
    c.id, c.classId, c.externalId,
    ROW_NUMBER() OVER (
      PARTITION BY c.classId, c.externalId
      ORDER BY
        (SELECT COUNT(*) FROM Split s WHERE s.competitorId = c.id) DESC,
        c.updatedAt DESC,
        c.id DESC
    ) AS rn
  FROM Competitor c
  WHERE c.externalId IS NOT NULL
) w
  ON w.classId = l.classId
 AND w.externalId = l.externalId
 AND w.rn = 1
WHERE l.rn > 1;

SELECT
  COUNT(*) AS total_losers,
  COUNT(DISTINCT winner_id) AS distinct_winners
FROM _competitor_merge_plan;

-- Preview: 20 largest groups
SELECT '--- preview: 20 largest merge groups ---' AS info;
SELECT
  c.classId,
  c.externalId,
  p.winner_id,
  GROUP_CONCAT(p.loser_id ORDER BY p.loser_id) AS loser_ids,
  COUNT(*) AS losers
FROM _competitor_merge_plan p
JOIN Competitor c ON c.id = p.winner_id
GROUP BY p.winner_id, c.classId, c.externalId
ORDER BY losers DESC, p.winner_id ASC
LIMIT 20;

-- -----------------------------------------------------------------------------
-- Step 2: drop loser splits that would collide with winner splits
-- -----------------------------------------------------------------------------
SELECT '=== STEP 2: drop colliding loser splits ===' AS step;

DROP TEMPORARY TABLE IF EXISTS _split_to_delete;
CREATE TEMPORARY TABLE _split_to_delete (
  id INT UNSIGNED NOT NULL PRIMARY KEY
);

INSERT INTO _split_to_delete (id)
SELECT s.id
FROM Split s
JOIN _competitor_merge_plan p ON p.loser_id = s.competitorId
JOIN Split ws
  ON ws.competitorId = p.winner_id
 AND ws.controlCode = s.controlCode;

SELECT COUNT(*) AS splits_to_drop FROM _split_to_delete;

DELETE s FROM Split s
JOIN _split_to_delete d ON d.id = s.id;

SELECT ROW_COUNT() AS splits_dropped;

-- -----------------------------------------------------------------------------
-- Step 3: re-point remaining loser splits to winner
-- -----------------------------------------------------------------------------
SELECT '=== STEP 3: re-point loser splits to winners ===' AS step;

UPDATE Split s
JOIN _competitor_merge_plan p ON p.loser_id = s.competitorId
SET s.competitorId = p.winner_id;

SELECT ROW_COUNT() AS splits_repointed;

-- -----------------------------------------------------------------------------
-- Step 4: re-point loser protocol rows to winner (preserves audit trail)
-- -----------------------------------------------------------------------------
SELECT '=== STEP 4: re-point loser protocol rows to winners ===' AS step;

UPDATE Protocol pr
JOIN _competitor_merge_plan p ON p.loser_id = pr.competitorId
SET pr.competitorId = p.winner_id;

SELECT ROW_COUNT() AS protocols_repointed;

-- -----------------------------------------------------------------------------
-- Step 5: delete loser competitor rows
-- -----------------------------------------------------------------------------
SELECT '=== STEP 5: delete loser competitor rows ===' AS step;

DELETE c FROM Competitor c
JOIN _competitor_merge_plan p ON p.loser_id = c.id;

SELECT ROW_COUNT() AS losers_deleted;

-- -----------------------------------------------------------------------------
-- Verification: must return 0 rows
-- -----------------------------------------------------------------------------
SELECT '=== VERIFICATION ===' AS step;

SELECT
  COUNT(*) AS remaining_duplicate_groups,
  SUM(dup_count - 1) AS remaining_rows_to_remove
FROM (
  SELECT classId, externalId, COUNT(*) AS dup_count
  FROM Competitor
  WHERE externalId IS NOT NULL
  GROUP BY classId, externalId
  HAVING COUNT(*) > 1
) t;

-- Cleanup
DROP TEMPORARY TABLE _split_to_delete;
DROP TEMPORARY TABLE _competitor_merge_plan;

-- -----------------------------------------------------------------------------
-- DECIDE NOW:
--   - If "remaining_duplicate_groups" is NULL or 0 → COMMIT;
--   - Otherwise                                   → ROLLBACK;
-- -----------------------------------------------------------------------------
SELECT '=== READY. Run COMMIT or ROLLBACK now. ===' AS step;
