-- CreateTable
CREATE TABLE `Organisation` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(64) NULL,
    `name` VARCHAR(191) NOT NULL,
    `nationality` CHAR(3) NULL,
    `shortName` VARCHAR(10) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Organisation_eventId_idx`(`eventId`),
    INDEX `Organisation_eventId_shortName_idx`(`eventId`, `shortName`),
    UNIQUE INDEX `Organisation_event_external_id_uq`(`eventId`, `externalId`),
    UNIQUE INDEX `Organisation_event_name_uq`(`eventId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Organisation` ADD CONSTRAINT `Organisation_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add organisationId columns to Competitor and Team
ALTER TABLE `Competitor` ADD COLUMN `organisationId` INTEGER UNSIGNED NULL;
ALTER TABLE `Team` ADD COLUMN `organisationId` INTEGER UNSIGNED NULL;

-- Data migration: seed Organisation rows from existing Competitor/Team data, scoped per event.
-- Empty / whitespace-only organisation names are treated as NULL and skipped.
INSERT INTO `Organisation` (`eventId`, `name`, `shortName`, `updatedAt`)
SELECT src.eventId, src.name, MIN(src.shortName) AS shortName, NOW(3)
FROM (
    SELECT
        cl.eventId AS eventId,
        TRIM(c.organisation) AS name,
        NULLIF(TRIM(c.shortName), '') AS shortName
    FROM `Competitor` c
    JOIN `Class` cl ON cl.id = c.classId
    WHERE c.organisation IS NOT NULL AND TRIM(c.organisation) <> ''
    UNION ALL
    SELECT
        cl.eventId AS eventId,
        TRIM(t.organisation) AS name,
        NULLIF(TRIM(t.shortName), '') AS shortName
    FROM `Team` t
    JOIN `Class` cl ON cl.id = t.classId
    WHERE t.organisation IS NOT NULL AND TRIM(t.organisation) <> ''
) src
GROUP BY src.eventId, src.name;

-- Link Competitor.organisationId
UPDATE `Competitor` c
JOIN `Class` cl ON cl.id = c.classId
JOIN `Organisation` o
  ON o.eventId = cl.eventId
 AND o.name = TRIM(c.organisation)
SET c.organisationId = o.id
WHERE c.organisation IS NOT NULL AND TRIM(c.organisation) <> '';

-- Link Team.organisationId
UPDATE `Team` t
JOIN `Class` cl ON cl.id = t.classId
JOIN `Organisation` o
  ON o.eventId = cl.eventId
 AND o.name = TRIM(t.organisation)
SET t.organisationId = o.id
WHERE t.organisation IS NOT NULL AND TRIM(t.organisation) <> '';

-- Drop old denormalised columns
ALTER TABLE `Competitor` DROP COLUMN `organisation`, DROP COLUMN `shortName`;
ALTER TABLE `Team` DROP COLUMN `organisation`, DROP COLUMN `shortName`;

-- AddForeignKey + indexes for new FKs
CREATE INDEX `Competitor_organisationId_idx` ON `Competitor`(`organisationId`);
CREATE INDEX `Team_organisationId_idx` ON `Team`(`organisationId`);

ALTER TABLE `Competitor` ADD CONSTRAINT `Competitor_organisationId_fkey` FOREIGN KEY (`organisationId`) REFERENCES `Organisation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Team` ADD CONSTRAINT `Team_organisationId_fkey` FOREIGN KEY (`organisationId`) REFERENCES `Organisation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
