ALTER TABLE `Event` ADD COLUMN `entryPaymentLifetimeHours` INTEGER NULL;
ALTER TABLE `Entry` ADD COLUMN `paymentDueAt` DATETIME(3) NULL;
CREATE INDEX `Entry_payment_expiry_idx` ON `Entry` (`status`, `paid`, `paymentDueAt`);
