-- CreateTable: Currency reference data
CREATE TABLE `Currency` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(254) NOT NULL,
    `iso4217Alpha3` CHAR(3) NOT NULL,
    `iso4217Num3` SMALLINT UNSIGNED,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Currency_iso4217Alpha3_key`(`iso4217Alpha3`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Insert CZK as id=1 – required because Event.currencyId DEFAULT 1 references this row
INSERT INTO `Currency` (`id`, `name`, `iso4217Alpha3`, `iso4217Num3`) VALUES
  (1, 'Czech koruna', 'CZK', 203);

-- Add currencyId column to Event with default pointing to CZK
ALTER TABLE `Event` ADD COLUMN `currencyId` INT UNSIGNED NOT NULL DEFAULT 1;

-- Add foreign key from Event to Currency
ALTER TABLE `Event` ADD CONSTRAINT `Event_currencyId_fkey` FOREIGN KEY (`currencyId`) REFERENCES `Currency`(`id`) ON UPDATE CASCADE;

-- Drop the old currency column (safe because all events now have currencyId)
ALTER TABLE `Event` DROP COLUMN `currency`;
