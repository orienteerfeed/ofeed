-- Merge separate date (DATE) and zeroTime (TIME) columns into a single DATETIME column.
-- The new `date` stores the UTC event start timestamp.
ALTER TABLE `event` ADD COLUMN `date_tmp` DATETIME(0) NOT NULL DEFAULT '1970-01-01 00:00:00' AFTER `organizer`;
UPDATE `event` SET `date_tmp` = TIMESTAMP(DATE(`date`), `zeroTime`);
ALTER TABLE `event` DROP COLUMN `zeroTime`;
ALTER TABLE `event` DROP COLUMN `date`;
ALTER TABLE `event` CHANGE `date_tmp` `date` DATETIME(0) NOT NULL AFTER `organizer`;
