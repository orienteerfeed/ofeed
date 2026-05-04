-- Step 1: Plain index on competitorId for efficient per-competitor lookups.
-- Must be created before dropping the old index so the FK on competitorId
-- always has a backing index (MariaDB rejects dropping the last one).
CREATE INDEX `Split_competitor_idx` ON `Split`(`competitorId`);

-- Step 2: Drop the non-unique composite index now that the FK is covered above.
DROP INDEX `Split_competitor_control_idx` ON `Split`;
