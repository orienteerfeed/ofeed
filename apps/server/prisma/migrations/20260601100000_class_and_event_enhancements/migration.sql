-- AlterTable: rename printedMaps → maxNumberOfCompetitors on Class
ALTER TABLE `Class` RENAME COLUMN `printedMaps` TO `maxNumberOfCompetitors`;

-- AlterTable: add resultListMode column
ALTER TABLE `Class` ADD COLUMN `resultListMode` ENUM('Default', 'Unordered', 'UnorderedNoTimes') NULL;

-- AlterTable: add per-class entry fee (gross, incl. VAT)
ALTER TABLE `Class` ADD COLUMN `fee` DECIMAL(10, 2) NULL;

-- AlterTable: add event-level fee configuration (currency, VAT, late-entry surcharge)
ALTER TABLE `Event` ADD COLUMN `currency` CHAR(3) NOT NULL DEFAULT 'CZK';
ALTER TABLE `Event` ADD COLUMN `vatPayer` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Event` ADD COLUMN `vatRate` DECIMAL(5, 2) NULL;
ALTER TABLE `Event` ADD COLUMN `lateEntryFeePercent` DECIMAL(5, 2) NULL;

-- AlterTable: split legacy Event.startMode into competitionFormat + defaultStartMode
ALTER TABLE `Event` ADD COLUMN `eventFormat` ENUM('Standard', 'ScoreO') NOT NULL DEFAULT 'Standard';
ALTER TABLE `Event` ADD COLUMN `defaultStartMode` ENUM('StartList', 'MassStart', 'PursuitStart', 'WaveStart', 'FreeStart') NOT NULL DEFAULT 'StartList';

UPDATE `Event` SET `eventFormat` = 'ScoreO' WHERE `startMode` = 'ScoreO';
UPDATE `Event` SET `defaultStartMode` = CASE `startMode`
  WHEN 'Mass'     THEN 'MassStart'
  WHEN 'Pursuit'  THEN 'PursuitStart'
  WHEN 'Handicap' THEN 'PursuitStart'
  WHEN 'Wave'     THEN 'WaveStart'
  ELSE 'StartList'
END;

ALTER TABLE `Event` DROP COLUMN `startMode`;

-- AlterTable: nullable per-class start-mode override + optional start window
ALTER TABLE `Class` ADD COLUMN `startMode` ENUM('StartList', 'MassStart', 'PursuitStart', 'WaveStart', 'FreeStart') NULL;
ALTER TABLE `Class` ADD COLUMN `startWindowFrom` DATETIME(3) NULL;
ALTER TABLE `Class` ADD COLUMN `startWindowTo` DATETIME(3) NULL;
