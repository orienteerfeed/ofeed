-- Step 1: Drop the non-unique index — the unique constraint below provides
-- an equivalent covering index and keeping both wastes space and write I/O.
DROP INDEX `Split_competitor_control_idx` ON `Split`;

-- Step 2: Plain index on competitorId for efficient per-competitor lookups.
CREATE INDEX `Split_competitor_idx` ON `Split`(`competitorId`);
