/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. Existing date part will be dropped and only time part will be kept.

*/
-- AlterTable
ALTER TABLE `Event`
  MODIFY `zeroTime` TIME(0) NOT NULL;
