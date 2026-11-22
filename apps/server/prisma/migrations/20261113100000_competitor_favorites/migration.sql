ALTER TABLE `UserNotification`
  MODIFY `entryId` VARCHAR(191) NULL,
  MODIFY `kind` ENUM('ENTRY_ORDER_RECEIVED','ENTRY_PAYMENT_RECEIVED','COMPETITOR_STARTED','COMPETITOR_RADIO','COMPETITOR_FINISHED','COMPETITOR_READOUT','COMPETITOR_RESULT_CHANGED') NOT NULL,
  ADD COLUMN `competitorId` INTEGER UNSIGNED NULL,
  ADD COLUMN `competitorName` VARCHAR(511) NULL,
  ADD COLUMN `status` ENUM('OK','Finished','MissingPunch','Disqualified','DidNotFinish','Active','Inactive','OverTime','SportingWithdrawal','NotCompeting','Moved','MovedUp','DidNotStart','DidNotEnter','Cancelled') NULL,
  ADD COLUMN `raceTime` INTEGER NULL,
  ADD COLUMN `controlCode` INTEGER NULL,
  ADD COLUMN `splitTime` INTEGER NULL,
  ADD CONSTRAINT `UserNotification_competitorId_fkey` FOREIGN KEY (`competitorId`) REFERENCES `Competitor` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `CompetitorFavorite` (
  `userId` INTEGER UNSIGNED NOT NULL,
  `competitorId` INTEGER UNSIGNED NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`, `competitorId`),
  INDEX `CompetitorFavorite_competitor_idx` (`competitorId`),
  CONSTRAINT `CompetitorFavorite_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CompetitorFavorite_competitorId_fkey` FOREIGN KEY (`competitorId`) REFERENCES `Competitor` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
