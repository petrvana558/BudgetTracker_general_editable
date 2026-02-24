-- AlterTable
ALTER TABLE "LaborCost" ADD COLUMN "spent" REAL;

-- CreateTable
CREATE TABLE "Comment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "itemId" INTEGER NOT NULL,
    "author" TEXT NOT NULL DEFAULT 'System',
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BudgetItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LaborRoleEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "laborCostId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LaborRoleEntry_laborCostId_fkey" FOREIGN KEY ("laborCostId") REFERENCES "LaborCost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LaborSpentLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TestSet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "dateMin" DATETIME,
    "dateMax" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "testSetId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WIP',
    "notes" TEXT,
    "testedBy" TEXT,
    "testedAt" DATETIME,
    "dataUsed" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCase_testSetId_fkey" FOREIGN KEY ("testSetId") REFERENCES "TestSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestStep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "testCaseId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WIP',
    "testedBy" TEXT,
    "testedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestStep_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Defect" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "testCaseId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "reportedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Defect_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BudgetItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT,
    "subcategory" TEXT,
    "description" TEXT NOT NULL,
    "itemType" TEXT,
    "unit" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "depreciationMonths" INTEGER,
    "totalEstCost" REAL,
    "additionalCostRevision" REAL,
    "totalCostAfterRevision" REAL,
    "actualPrice" REAL,
    "capexNeeded" BOOLEAN NOT NULL DEFAULT false,
    "tenderStatus" TEXT,
    "tenderStartDate" DATETIME,
    "tenderDeadline" DATETIME,
    "orderPlaceDate" DATETIME,
    "deliveryDate" DATETIME,
    "approval" TEXT,
    "chosenSupplier" TEXT,
    "bottleneck" TEXT,
    "notes" TEXT,
    "checklistJson" TEXT NOT NULL DEFAULT '[]',
    "responsibleId" INTEGER,
    "priorityId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BudgetItem_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BudgetItem_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "Priority" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BudgetItem" ("actualPrice", "additionalCostRevision", "approval", "bottleneck", "capexNeeded", "category", "chosenSupplier", "createdAt", "deliveryDate", "depreciationMonths", "description", "id", "itemType", "notes", "orderPlaceDate", "priorityId", "quantity", "responsibleId", "subcategory", "tenderDeadline", "tenderStartDate", "tenderStatus", "totalCostAfterRevision", "totalEstCost", "unit", "updatedAt") SELECT "actualPrice", "additionalCostRevision", "approval", "bottleneck", "capexNeeded", "category", "chosenSupplier", "createdAt", "deliveryDate", "depreciationMonths", "description", "id", "itemType", "notes", "orderPlaceDate", "priorityId", "quantity", "responsibleId", "subcategory", "tenderDeadline", "tenderStartDate", "tenderStatus", "totalCostAfterRevision", "totalEstCost", "unit", "updatedAt" FROM "BudgetItem";
DROP TABLE "BudgetItem";
ALTER TABLE "new_BudgetItem" RENAME TO "BudgetItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
