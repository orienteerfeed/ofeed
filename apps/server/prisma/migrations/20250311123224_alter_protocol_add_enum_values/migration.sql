/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Event` MODIFY `zeroTime` DATETIME NOT NULL;

-- AlterTable
ALTER TABLE `Protocol` MODIFY `origin` ENUM('START', 'OFFICE', 'FINISH', 'IT') NOT NULL,
    MODIFY `type` ENUM('competitor_create', 'competitor_update', 'class_change', 'firstname_change', 'lastname_change', 'bibNumber_change', 'nationality_change', 'registration_change', 'license_change', 'ranking_change', 'rank_points_avg_change', 'organisation_change', 'short_name_change', 'si_card_change', 'start_time_change', 'finish_time_change', 'time_change', 'team_change', 'leg_change', 'status_change', 'late_start_change', 'note_change', 'external_id_change') NOT NULL;
