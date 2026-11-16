CREATE TABLE `AthleteFollow` (
  `id` VARCHAR(191) NOT NULL,
  `userId` INTEGER UNSIGNED NOT NULL,
  `registration` VARCHAR(10) NOT NULL,
  `source` ENUM('ORIS','EVENTOR','LOCAL') NOT NULL,
  `displayName` VARCHAR(511) NOT NULL,
  `pausedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AthleteFollow_user_identity_uq` (`userId`,`source`,`registration`),
  INDEX `AthleteFollow_identity_idx` (`source`,`registration`,`pausedAt`),
  CONSTRAINT `AthleteFollow_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserNotification` ADD COLUMN `athleteFollowId` VARCHAR(191) NULL,
  ADD CONSTRAINT `UserNotification_athleteFollowId_fkey` FOREIGN KEY (`athleteFollowId`) REFERENCES `AthleteFollow` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `AthleteFollow` (`id`,`userId`,`registration`,`source`,`displayName`,`createdAt`,`updatedAt`)
SELECT CONCAT('legacy-', MD5(CONCAT_WS(':', f.userId, COALESCE(e.externalSource,'LOCAL'), UPPER(TRIM(c.registration))))),
  f.userId, UPPER(TRIM(c.registration)), COALESCE(e.externalSource,'LOCAL'),
  MAX(CONCAT(c.lastname,' ',c.firstname)), MIN(f.createdAt), CURRENT_TIMESTAMP(3)
FROM `CompetitorFavorite` f
JOIN `Competitor` c ON c.id=f.competitorId
JOIN `Class` cl ON cl.id=c.classId
JOIN `Event` e ON e.id=cl.eventId
JOIN `User` u ON u.id=f.userId
WHERE TRIM(c.registration)<>'' AND u.deletedAt IS NULL
GROUP BY f.userId, COALESCE(e.externalSource,'LOCAL'), UPPER(TRIM(c.registration));

UPDATE `UserNotification` n
JOIN `Competitor` c ON c.id=n.competitorId
JOIN `Class` cl ON cl.id=c.classId
JOIN `Event` e ON e.id=cl.eventId
JOIN `AthleteFollow` f ON f.userId=n.userId AND f.registration=UPPER(TRIM(c.registration)) AND f.source=COALESCE(e.externalSource,'LOCAL')
SET n.athleteFollowId=f.id
WHERE n.kind NOT IN ('ENTRY_ORDER_RECEIVED','ENTRY_PAYMENT_RECEIVED');

-- Registered selections now resolve through the canonical cross-event identity.
DELETE cf FROM `CompetitorFavorite` cf
JOIN `Competitor` c ON c.id=cf.competitorId
JOIN `Class` cl ON cl.id=c.classId
JOIN `Event` e ON e.id=cl.eventId
JOIN `AthleteFollow` f ON f.userId=cf.userId AND f.registration=UPPER(TRIM(c.registration)) AND f.source=COALESCE(e.externalSource,'LOCAL');
