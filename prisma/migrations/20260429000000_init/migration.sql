-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "repoUrl" TEXT,
    "branch" TEXT,
    "uploadId" TEXT,
    "projectType" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "buildSpecYaml" TEXT,
    "envJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "exitCode" INTEGER,
    "errorMessage" TEXT,
    "workspacePath" TEXT
);

-- CreateTable
CREATE TABLE "BuildLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "buildId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stream" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    CONSTRAINT "BuildLog_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buildId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Artifact_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Build_createdAt_idx" ON "Build"("createdAt");

-- CreateIndex
CREATE INDEX "Build_status_idx" ON "Build"("status");

-- CreateIndex
CREATE INDEX "BuildLog_buildId_id_idx" ON "BuildLog"("buildId", "id");

-- CreateIndex
CREATE INDEX "Artifact_buildId_idx" ON "Artifact"("buildId");
