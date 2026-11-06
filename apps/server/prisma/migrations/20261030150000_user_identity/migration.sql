-- AlterTable
ALTER TABLE `User` ADD COLUMN `passwordSet` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `UserIdentity` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `provider` ENUM('ORIS', 'GOOGLE', 'GITHUB') NOT NULL,
    `providerUserId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `UserIdentity_provider_subject_uq`(`provider`, `providerUserId`),
    UNIQUE INDEX `UserIdentity_user_provider_uq`(`userId`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserIdentity` ADD CONSTRAINT `UserIdentity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
