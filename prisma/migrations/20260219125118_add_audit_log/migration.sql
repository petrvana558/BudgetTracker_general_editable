-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user" TEXT NOT NULL DEFAULT 'System',
    "entity" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" INTEGER,
    "summary" TEXT NOT NULL
);
