-- AlterTable
ALTER TABLE `Protocol`
  ADD COLUMN `processed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `processedAt` DATETIME(3) NULL,
  ADD COLUMN `processedByType` ENUM('USER', 'INTEGRATION', 'SYSTEM') NULL,
  ADD COLUMN `processedByUserId` INTEGER UNSIGNED NULL,
  ADD COLUMN `processedBySource` VARCHAR(128) NULL;

-- CreateIndex
CREATE INDEX `Protocol_event_origin_processed_created_idx`
  ON `Protocol`(`eventId`, `origin`, `processed`, `createdAt`, `id`);

-- AddForeignKey
ALTER TABLE `Protocol`
  ADD CONSTRAINT `Protocol_processedByUserId_fkey`
  FOREIGN KEY (`processedByUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
