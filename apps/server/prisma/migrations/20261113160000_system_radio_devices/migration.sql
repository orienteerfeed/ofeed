ALTER TABLE `YarocSession`
  ADD COLUMN `scope` VARCHAR(10) NOT NULL DEFAULT 'event',
  ADD COLUMN `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`eventId`, `scope`);

CREATE TABLE `PlatformRadioLock` (
  `id` INTEGER NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `PlatformRadioLock` (`id`) VALUES (1);

CREATE TABLE `SystemRadioDevice` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `sourceType` VARCHAR(20) NOT NULL,
  `macAddress` VARCHAR(12) NOT NULL,
  `intervalSeconds` INTEGER NOT NULL DEFAULT 60,
  `brokerProfile` VARCHAR(50) NOT NULL DEFAULT 'default',
  `meshtasticChannel` VARCHAR(100) NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `createdById` INTEGER UNSIGNED NOT NULL,
  `updatedById` INTEGER UNSIGNED NOT NULL,
  `currentAssignmentId` VARCHAR(36) NULL,
  UNIQUE INDEX `SystemRadioDevice_name_key` (`name`),
  UNIQUE INDEX `SystemRadioDevice_macAddress_key` (`macAddress`),
  UNIQUE INDEX `SystemRadioDevice_currentAssignmentId_key` (`currentAssignmentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LiveDevice`
  ADD COLUMN `systemDeviceId` VARCHAR(36) NULL,
  ADD UNIQUE INDEX `LiveDevice_eventId_systemDeviceId_key` (`eventId`, `systemDeviceId`),
  ADD CONSTRAINT `LiveDevice_systemDeviceId_fkey` FOREIGN KEY (`systemDeviceId`) REFERENCES `SystemRadioDevice` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `SystemRadioAssignment` (
  `id` VARCHAR(36) NOT NULL,
  `systemDeviceId` VARCHAR(36) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `liveDeviceId` VARCHAR(36) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endedAt` DATETIME(3) NULL,
  `assignedById` INTEGER UNSIGNED NOT NULL,
  `endedById` INTEGER UNSIGNED NULL,
  INDEX `SystemRadioAssignment_systemDeviceId_assignedAt_idx` (`systemDeviceId`, `assignedAt`),
  INDEX `SystemRadioAssignment_eventId_endedAt_idx` (`eventId`, `endedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SystemRadioAssignment_systemDeviceId_fkey` FOREIGN KEY (`systemDeviceId`) REFERENCES `SystemRadioDevice` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `SystemRadioAssignment_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SystemRadioAssignment_liveDeviceId_fkey` FOREIGN KEY (`liveDeviceId`) REFERENCES `LiveDevice` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SystemRadioDevice` ADD CONSTRAINT `SystemRadioDevice_currentAssignmentId_fkey`
  FOREIGN KEY (`currentAssignmentId`) REFERENCES `SystemRadioAssignment` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
