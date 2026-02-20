-- CreateTable
CREATE TABLE "LaborCost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "personName" TEXT,
    "amount" REAL NOT NULL,
    "costType" TEXT NOT NULL DEFAULT 'Annual',
    "department" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
