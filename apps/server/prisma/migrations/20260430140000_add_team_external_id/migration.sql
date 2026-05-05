/*
  Warnings:

  - A unique constraint covering the columns `[classId,externalId]` on the table `Team` will be added. If there are existing duplicate values, this will fail.
    (No existing rows have externalId set, so this is safe.)

*/
-- AlterTable: add nullable externalId column for IOF EntryId
ALTER TABLE `Team` ADD COLUMN `externalId` VARCHAR(191) NULL;

-- CreateIndex: event-scoped unique lookup by EntryId
-- NULL values are excluded from uniqueness checks in MariaDB, so teams
-- without an EntryId can coexist in the same class without conflict.
CREATE UNIQUE INDEX `Team_class_external_uq` ON `Team`(`classId`, `externalId`);
