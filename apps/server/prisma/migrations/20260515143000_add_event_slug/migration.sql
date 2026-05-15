ALTER TABLE `Event`
    ADD COLUMN `slug` VARCHAR(64) NULL;

CREATE UNIQUE INDEX `Event_slug_key` ON `Event`(`slug`);
