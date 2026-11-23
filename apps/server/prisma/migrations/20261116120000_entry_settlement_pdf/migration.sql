ALTER TABLE `Event` ADD COLUMN `settlementEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `organizerDetails` JSON NULL;
ALTER TABLE `Entry` ADD COLUMN `payerDetails` JSON NULL;
