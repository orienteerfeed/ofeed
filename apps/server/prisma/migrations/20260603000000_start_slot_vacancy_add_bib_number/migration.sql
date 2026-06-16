-- AlterTable
ALTER TABLE `StartSlotVacancy` ADD COLUMN `bibNumber` INTEGER NULL;

-- CreateIndex
CREATE INDEX `StartSlotVacancy_bib_number_idx` ON `StartSlotVacancy`(`bibNumber`);
