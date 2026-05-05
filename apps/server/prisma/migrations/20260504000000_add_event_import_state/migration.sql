-- CreateTable: tracks per-event, per-source, per-payload import state for deduplication
CREATE TABLE `EventImportState` (
    `id`                     INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId`                VARCHAR(191) NOT NULL,
    `sourceType`             ENUM('IOF_XML') NOT NULL,
    `payloadType`            VARCHAR(32) NOT NULL,
    `rawHash`                CHAR(64) NOT NULL,
    `creator`                VARCHAR(128) NULL,
    `externalCreateTime`     DATETIME(3) NULL,
    `formatVersion`          VARCHAR(16) NULL,
    `externalStatus`         VARCHAR(32) NULL,
    `rootElement`            VARCHAR(64) NULL,
    `lastSuccessfulImportAt` DATETIME(3) NULL,
    `lastSkippedAt`          DATETIME(3) NULL,
    `successCount`           INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `skippedCount`           INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `createdAt`              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`              DATETIME(3) NOT NULL,

    INDEX `event_import_state_event_idx`(`eventId`),
    UNIQUE INDEX `event_import_state_event_source_payload_uq`(`eventId`, `sourceType`, `payloadType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventImportState` ADD CONSTRAINT `EventImportState_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
