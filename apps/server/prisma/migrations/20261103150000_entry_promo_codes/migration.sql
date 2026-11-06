-- AlterTable
ALTER TABLE `Entry` ADD COLUMN `promoCode` VARCHAR(40) NULL,
    ADD COLUMN `promoCodeId` VARCHAR(191) NULL,
    ADD COLUMN `promoDiscountAmount` DECIMAL(10, 2) NULL,
    ADD COLUMN `promoEligibleAmount` DECIMAL(10, 2) NULL,
    ADD COLUMN `promoPercent` DECIMAL(5, 2) NULL;

-- AlterTable
ALTER TABLE `EntryItem` ADD COLUMN `allowPromoCode` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `registrationDiscountPercent` DECIMAL(5, 2) NULL;

-- CreateTable
CREATE TABLE `PromoCode` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `discountPercent` DECIMAL(5, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` INTEGER UNSIGNED NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` INTEGER UNSIGNED NULL,

    UNIQUE INDEX `PromoCode_eventId_code_key`(`eventId`, `code`),
    UNIQUE INDEX `PromoCode_eventId_id_key`(`eventId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PromoCode` ADD CONSTRAINT `PromoCode_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Entry` ADD CONSTRAINT `Entry_eventId_promoCodeId_fkey` FOREIGN KEY (`eventId`, `promoCodeId`) REFERENCES `PromoCode`(`eventId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
