-- CreateTable
CREATE TABLE `StartSlotVacancy` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `classId` INTEGER UNSIGNED NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StartSlotVacancy_class_idx`(`classId`),
    INDEX `StartSlotVacancy_start_time_idx`(`startTime`),
    UNIQUE INDEX `StartSlotVacancy_class_start_time_uq`(`classId`, `startTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StartSlotVacancy` ADD CONSTRAINT `StartSlotVacancy_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
