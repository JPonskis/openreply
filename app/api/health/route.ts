import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getDMQueue, getRedisConnection } from "@/lib/queue/client";
import { getWorkerHealth } from "@/lib/ops/worker-health";

export const runtime = "nodejs";
// Health must reflect live state (worker heartbeat, queue depth), never a
// cached response, or it reports stale worker start times.
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

interface HealthCheck {
  status: CheckStatus;
  detail?: string;
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "Database check failed",
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  try {
    const pong = await getRedisConnection().ping();
    return { status: pong === "PONG" ? "ok" : "error", detail: pong };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "Redis check failed",
    };
  }
}

async function checkQueue(): Promise<HealthCheck & { counts?: unknown }> {
  try {
    const counts = await getDMQueue().getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed"
    );
    return { status: "ok", counts };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "Queue check failed",
    };
  }
}

/**
 * Delivery-level facts for external watchdogs. The infra checks above say the
 * machine is up; these say whether the machine is DOING anything and whether
 * anything it did failed — because a quiet system and a dead system look
 * identical from the infra checks alone. Counts only, no PII: this endpoint
 * is unauthenticated.
 */
async function checkOps() {
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      dmSent24h,
      dmFailed24h,
      publicReplyErrors24h,
      webhookEvents24h,
      sweepErrors24h,
      accounts,
      fbPages,
      looseMatchCampaigns,
      sentenceDmRows,
    ] = await Promise.all([
      prisma.dmLog.count({
        where: { status: "SENT", dmSentAt: { gte: dayAgo } },
      }),
      prisma.dmLog.count({
        where: { status: "FAILED", updatedAt: { gte: dayAgo } },
      }),
      prisma.dmLog.count({
        where: { publicReplyError: { not: null }, updatedAt: { gte: dayAgo } },
      }),
      prisma.webhookEvent.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.operationalEvent.count({
        where: {
          level: { in: ["WARNING", "ERROR"] },
          message: { contains: "sweep" },
          createdAt: { gte: dayAgo },
        },
      }),
      prisma.instagramAccount.findMany({
        select: { tokenExpiresAt: true },
      }),
      prisma.facebookPage.count(),
      // Spam guard, read two independent ways so neither medium is trusted
      // alone. Config: how many live campaigns are on a loose match mode that
      // fires mid-sentence. Outcome: how many DMs actually went to a comment
      // long enough to have been a sentence rather than a request. Under the
      // default "standalone" mode both should sit at zero; either one climbing
      // means people are being DM'd for talking, which reads as spam.
      prisma.automation.count({
        where: { isActive: true, matchAnyWord: false, matchMode: { notIn: ["standalone", "exact"] } },
      }),
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "DmLog"
        WHERE status = 'SENT' AND "dmSentAt" >= ${dayAgo}
        AND array_length(regexp_split_to_array(btrim("commentText"), '[[:space:]]+'), 1) >= 10
      `,
    ]);

    const soonest = accounts
      .map((a) => a.tokenExpiresAt?.getTime())
      .filter((t): t is number => typeof t === "number")
      .sort((a, b) => a - b)[0];
    const igTokenDaysRemaining =
      soonest === undefined
        ? null
        : Math.floor((soonest - Date.now()) / (24 * 60 * 60 * 1000));

    return {
      status: "ok" as const,
      dmSent24h,
      dmFailed24h,
      publicReplyErrors24h,
      webhookEvents24h,
      sweepErrors24h,
      igAccounts: accounts.length,
      fbPages,
      igTokenDaysRemaining,
      looseMatchCampaigns,
      sentenceDms24h: Number(sentenceDmRows[0]?.count ?? 0),
    };
  } catch (error) {
    return {
      status: "error" as const,
      detail: error instanceof Error ? error.message : "Ops check failed",
    };
  }
}

export async function GET() {
  const [database, redis, queue, worker, ops] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkQueue(),
    getWorkerHealth().catch((error) => ({
      healthy: false,
      heartbeat: null,
      ageMs: null,
      error: error instanceof Error ? error.message : "Worker check failed",
    })),
    checkOps(),
  ]);

  const healthy =
    database.status === "ok" &&
    redis.status === "ok" &&
    queue.status === "ok" &&
    worker.healthy;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: {
        database,
        redis,
        queue,
        worker,
        ops,
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
