-- Fix Currency.updatedAt: MODIFY COLUMN removes both DEFAULT and ON UPDATE CURRENT_TIMESTAMP
-- that were left over from the handcrafted add_currency_table migration.
-- Prisma manages @updatedAt at the application level and expects DATETIME(3) NOT NULL with no DB-level default.
ALTER TABLE `Currency` MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL;
