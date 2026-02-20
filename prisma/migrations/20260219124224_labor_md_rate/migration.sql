/*
  Warnings:

  - You are about to drop the column `amount` on the `LaborCost` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LaborCost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "personName" TEXT,
    "mdRate" REAL NOT NULL DEFAULT 0,
    "mdDays" REAL NOT NULL DEFAULT 0,
    "costType" TEXT NOT NULL DEFAULT 'Project',
    "department" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_LaborCost" ("costType", "createdAt", "department", "id", "notes", "personName", "role", "updatedAt") SELECT "costType", "createdAt", "department", "id", "notes", "personName", "role", "updatedAt" FROM "LaborCost";
DROP TABLE "LaborCost";
ALTER TABLE "new_LaborCost" RENAME TO "LaborCost";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
