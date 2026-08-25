-- The Facebook Pages lane: connected Pages + per-row platform on DmLog.

CREATE TABLE "FacebookPage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "accessToken" TEXT NOT NULL,
    "webhookSubscribed" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacebookPage_pageId_key" ON "FacebookPage"("pageId");
CREATE INDEX "FacebookPage_workspaceId_idx" ON "FacebookPage"("workspaceId");

ALTER TABLE "FacebookPage" ADD CONSTRAINT "FacebookPage_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DmLog" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'instagram';
