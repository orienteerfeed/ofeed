-- AlterTable
ALTER TABLE `Entry` ADD COLUMN `priceAdjustment` DECIMAL(10, 2) NULL,
    ADD COLUMN `priceAdjustmentReason` VARCHAR(191) NULL,
    ADD COLUMN `priceAdjustedById` INTEGER UNSIGNED NULL;
