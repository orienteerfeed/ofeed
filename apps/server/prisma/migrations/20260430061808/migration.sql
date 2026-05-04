/*
  Warnings:

  - A unique constraint covering the columns `[classId,externalId]` on the table `Competitor` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Competitor_class_external_uq` ON `Competitor`(`classId`, `externalId`);

-- CreateIndex
CREATE INDEX `Protocol_competitor_created_idx` ON `Protocol`(`competitorId`, `createdAt`);

-- CreateIndex
CREATE INDEX `Split_competitor_control_idx` ON `Split`(`competitorId`, `controlCode`);
