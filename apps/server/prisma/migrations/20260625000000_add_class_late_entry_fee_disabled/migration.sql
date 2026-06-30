-- AlterTable: allow selected classes to opt out of the late-entry fee increase
ALTER TABLE `Class` ADD COLUMN `lateEntryFeeDisabled` BOOLEAN NOT NULL DEFAULT false;
