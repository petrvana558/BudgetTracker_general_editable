-- CreateTable
CREATE TABLE "BudgetItem" (
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
    "responsibleId" INTEGER,
    "priorityId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BudgetItem_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BudgetItem_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "Priority" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Person" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "department" TEXT
);

-- CreateTable
CREATE TABLE "Priority" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#FFCC00',
    "rank" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "subcategories" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "Settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
