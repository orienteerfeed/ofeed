-- CreateTable
CREATE TABLE `LiveMonitoring` (
    `eventId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `until` DATETIME(3) NOT NULL,

    PRIMARY KEY (`eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveDevice` (
    `id` VARCHAR(36) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `sourceType` VARCHAR(20) NOT NULL,
    `macAddress` VARCHAR(12) NULL,
    `intervalSeconds` INTEGER NOT NULL DEFAULT 10,
    `tokenHash` CHAR(64) NULL,
    `revokedAt` DATETIME(3) NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `measuredAt` DATETIME(3) NULL,
    `metrics` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `LiveDevice_tokenHash_key`(`tokenHash`),
    UNIQUE INDEX `LiveDevice_eventId_name_key`(`eventId`, `name`),
    UNIQUE INDEX `LiveDevice_eventId_macAddress_key`(`eventId`, `macAddress`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveDeviceSample` (
    `deviceId` VARCHAR(36) NOT NULL,
    `minute` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL,
    `firstAt` DATETIME(3) NOT NULL,
    `lastAt` DATETIME(3) NOT NULL,
    `maxGapMs` INTEGER NOT NULL DEFAULT 0,
    `metrics` JSON NOT NULL,
    `minimum` JSON NOT NULL,
    `maximum` JSON NOT NULL,

    INDEX `LiveDeviceSample_minute_idx`(`minute`),
    PRIMARY KEY (`deviceId`, `minute`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveHeartbeatReceipt` (
    `deviceId` VARCHAR(36) NOT NULL,
    `messageId` VARCHAR(36) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,

    INDEX `LiveHeartbeatReceipt_receivedAt_idx`(`receivedAt`),
    PRIMARY KEY (`deviceId`, `messageId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveDeviceOutage` (
    `id` VARCHAR(36) NOT NULL,
    `deviceId` VARCHAR(36) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,

    UNIQUE INDEX `LiveDeviceOutage_deviceId_startedAt_key`(`deviceId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `YarocSession` (
    `eventId` VARCHAR(191) NOT NULL,
    `authorId` INTEGER UNSIGNED NOT NULL,
    `until` DATETIME(3) NOT NULL,
    `settings` JSON NOT NULL,
    `owner` VARCHAR(36) NULL,
    `generation` INTEGER NOT NULL DEFAULT 0,
    `leaseUntil` DATETIME(3) NULL,
    `state` VARCHAR(20) NOT NULL,
    `error` VARCHAR(500) NULL,

    PRIMARY KEY (`eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LiveMonitoring` ADD CONSTRAINT `LiveMonitoring_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveDevice` ADD CONSTRAINT `LiveDevice_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveDeviceSample` ADD CONSTRAINT `LiveDeviceSample_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `LiveDevice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveHeartbeatReceipt` ADD CONSTRAINT `LiveHeartbeatReceipt_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `LiveDevice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveDeviceOutage` ADD CONSTRAINT `LiveDeviceOutage_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `LiveDevice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `YarocSession` ADD CONSTRAINT `YarocSession_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
