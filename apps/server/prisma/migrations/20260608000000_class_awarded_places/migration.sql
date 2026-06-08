-- AlterTable: add awardedPlaces and remove stale competitorsCount from Class
ALTER TABLE `Class` ADD COLUMN `awardedPlaces` SMALLINT NULL DEFAULT 3;
ALTER TABLE `Class` DROP COLUMN `competitorsCount`;
