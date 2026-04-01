ALTER TABLE `RankingCzech`
    DROP INDEX `RankingCzech_registration_key`,
    ADD COLUMN `rankingType` ENUM('FOREST', 'SPRINT') NULL AFTER `id`,
    ADD COLUMN `validForMonth` DATE NULL AFTER `rankingType`;

UPDATE `RankingCzech`
SET
    `rankingType` = 'FOREST',
    `validForMonth` = STR_TO_DATE(DATE_FORMAT(COALESCE(`updatedAt`, `createdAt`), '%Y-%m-01'), '%Y-%m-%d')
WHERE `rankingType` IS NULL OR `validForMonth` IS NULL;

ALTER TABLE `RankingCzech`
    MODIFY `rankingType` ENUM('FOREST', 'SPRINT') NOT NULL,
    MODIFY `validForMonth` DATE NOT NULL;

CREATE INDEX `RankingCzech_rankingType_validForMonth_idx`
    ON `RankingCzech`(`rankingType`, `validForMonth`);

CREATE UNIQUE INDEX `RankingCzech_registration_rankingType_validForMonth_key`
    ON `RankingCzech`(`registration`, `rankingType`, `validForMonth`);

ALTER TABLE `Event`
    ADD COLUMN `discipline` ENUM(
        'SPRINT',
        'MIDDLE',
        'LONG',
        'ULTRALONG',
        'NIGHT',
        'KNOCKOUT_SPRINT',
        'RELAY',
        'SPRINT_RELAY',
        'TEAMS',
        'OTHER'
    ) NOT NULL DEFAULT 'OTHER' AFTER `relay`;

ALTER TABLE `Competitor`
    CHANGE COLUMN `ranking` `rankingPoints` INTEGER UNSIGNED NULL,
    CHANGE COLUMN `rankPointsAvg` `rankingReferenceValue` INTEGER UNSIGNED NULL;

ALTER TABLE `Protocol`
    MODIFY `type` ENUM(
        'competitor_create',
        'competitor_update',
        'class_change',
        'firstname_change',
        'lastname_change',
        'bibNumber_change',
        'nationality_change',
        'registration_change',
        'license_change',
        'ranking_change',
        'rank_points_avg_change',
        'ranking_points_change',
        'ranking_reference_value_change',
        'organisation_change',
        'short_name_change',
        'si_card_change',
        'start_time_change',
        'finish_time_change',
        'time_change',
        'team_change',
        'leg_change',
        'status_change',
        'late_start_change',
        'note_change',
        'external_id_change'
    ) NOT NULL;
