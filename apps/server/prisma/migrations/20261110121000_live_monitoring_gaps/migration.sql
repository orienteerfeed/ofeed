-- AlterTable
ALTER TABLE `LiveMonitoring` ADD COLUMN `checkedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `LiveDeviceOutage` ADD COLUMN `kind` VARCHAR(10) NOT NULL DEFAULT 'offline';
