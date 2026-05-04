-- Step 1: Create the replacement index before dropping the composite index.
-- MySQL requires an index on the foreign key column while
-- `Split_competitorId_fkey` exists.
CREATE INDEX `Split_competitor_idx` ON `Split`(`competitorId`);

-- Step 2: Drop the wider non-unique index after the foreign key has a
-- replacement index available.
DROP INDEX `Split_competitor_control_idx` ON `Split`;
