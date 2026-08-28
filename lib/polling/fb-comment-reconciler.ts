/**
 * Facebook comment reconciliation — the polling safety net for the Page lane.
 *
 * Same philosophy as the Instagram reconciler (see comment-reconciler.ts):
 * webhooks are best-effort, so every few minutes each connected Page's recent
 * posts are swept for keyword comments the Page has not answered. Enqueued
 * work reuses the worker's processFbComment, so rate limiting, dedup, and
 * logging behave exactly as for webhook-delivered comments.
 *
 * Sweep shape differs from Instagram in one way: campaigns are workspace-wide
 * on Facebook (their postIds are Instagram media ids), so the sweep walks
 * Pages → recent posts → comments, then matches each comment against every
 * active campaign in the Page's workspace. The worker does the same match
 * again — the filter here exists only to avoid enqueuing obvious non-matches.
 */

import { prisma } from "@/lib/db/client";
import { FB_COMMENT_JOB_NAME, getDMQueue } from "@/lib/queue/client";
import {
  getFacebookPagePosts,
  getRecentFacebookPostComments,
  type FacebookComment,
  type FacebookPost,
} from "@/lib/meta/fb-client";
import { MetaApiError } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { matchKeywords } from "@/lib/utils/keyword-matcher";

const LOOKBACK_HOURS = Number(process.env.COMMENT_POLL_LOOKBACK_HOURS ?? 72);
const MAX_NEW_PER_SWEEP = Number(process.env.COMMENT_POLL_MAX_PER_SWEEP ?? 30);
const RECENT_POSTS_LIMIT = 10;

function errMessage(error: unknown): string {
  if (error instanceof MetaApiError)
    return `Meta ${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

/** One reconciliation pass across every connected Facebook Page. */
export async function reconcileFacebookComments(): Promise<void> {
  const pages = await prisma.facebookPage.findMany();
  const sinceMs = Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000;

  for (const page of pages) {
    const errors: string[] = [];
    let enqueued = 0;
    let matched = 0;
    let alreadyReplied = 0;

    try {
      const campaigns = await prisma.automation.findMany({
        where: { isActive: true, workspaceId: page.workspaceId },
        select: {
          id: true,
          keywords: true,
          matchAnyWord: true,
          matchMode: true,
          publicReplyEnabled: true,
        },
      });
      if (campaigns.length === 0) continue;

      let pageToken: string;
      try {
        pageToken = decryptToken(page.accessToken);
      } catch {
        errors.push("Failed to decrypt Page token");
        await recordSweep(page.workspaceId, page.name, {
          enqueued,
          matched,
          alreadyReplied,
          errors,
        });
        continue;
      }

      let posts: FacebookPost[];
      try {
        posts = await getFacebookPagePosts(
          pageToken,
          page.pageId,
          RECENT_POSTS_LIMIT
        );
      } catch (error) {
        errors.push(`Post list: ${errMessage(error)}`);
        posts = [];
      }

      const queue = getDMQueue();
      let budget = MAX_NEW_PER_SWEEP;

      for (const post of posts) {
        if (budget <= 0) break;

        let comments: FacebookComment[];
        try {
          comments = await getRecentFacebookPostComments(
            pageToken,
            post.id,
            sinceMs
          );
        } catch (error) {
          errors.push(`Comments ${post.id}: ${errMessage(error)}`);
          continue;
        }

        const needsAction = comments.filter((c) => {
          // Facebook hides user identities on comment READS (webhooks carry
          // them; the API often returns no `from` for people who never used
          // the app). That does NOT block delivery: a private reply targets
          // the comment_id, not the person. Only the Page's own comments are
          // skipped — and those always carry attribution, so an unattributed
          // comment is guaranteed not ours.
          const authorId = c.from?.id;
          if (authorId === page.pageId) return false;

          const text = c.message ?? "";
          const anyMatch = campaigns.some((campaign) =>
            campaign.matchAnyWord
              ? true
              : matchKeywords(text, campaign.keywords, campaign.matchMode)
                  .matched
          );
          if (!anyMatch) return false;
          matched += 1;

          const pageReplied = (c.comments?.data ?? []).some(
            (r) => r.from?.id === page.pageId
          );
          if (pageReplied) {
            alreadyReplied += 1;
            return false;
          }
          return true;
        });
        if (needsAction.length === 0) continue;

        // Skip comments already fully handled by every matching campaign —
        // same completion rule as the Instagram sweep.
        const handled = await prisma.dmLog.findMany({
          where: {
            commentId: { in: needsAction.map((c) => c.id) },
            OR: [
              { publicReplySentAt: { not: null } },
              { status: "SENT" },
            ],
          },
          select: { commentId: true },
        });
        const handledSet = new Set(handled.map((h) => h.commentId));

        const fresh = needsAction
          .filter((c) => !handledSet.has(c.id))
          .sort(
            (a, b) => Date.parse(a.created_time) - Date.parse(b.created_time)
          )
          .slice(0, budget);

        for (const c of fresh) {
          // No deterministic jobId — same reasoning as the Instagram sweep: a
          // retained job would silently swallow the retry. The worker is
          // idempotent.
          await queue.add(FB_COMMENT_JOB_NAME, {
            pageId: page.pageId,
            commentId: c.id,
            commentText: c.message ?? "",
            // Synthetic id when reads hide the author; delivery keys off the
            // comment id, and DmLog dedup keys off (automationId, commentId).
            commenterId: c.from?.id ?? `fb-anon:${c.id}`,
            commenterName: c.from?.name,
            postId: post.id,
            source: "POLLING",
          });
          enqueued += 1;
          budget -= 1;
        }
      }
    } catch (error) {
      errors.push(errMessage(error));
    }

    await recordSweep(page.workspaceId, page.name, {
      enqueued,
      matched,
      alreadyReplied,
      errors,
    });
  }
}

async function recordSweep(
  workspaceId: string,
  pageName: string,
  stat: {
    enqueued: number;
    matched: number;
    alreadyReplied: number;
    errors: string[];
  }
): Promise<void> {
  if (stat.enqueued === 0 && stat.errors.length === 0) return;

  await prisma.operationalEvent
    .create({
      data: {
        workspaceId,
        source: "SYSTEM",
        level: stat.errors.length > 0 ? "WARNING" : "INFO",
        message: `FB comment sweep "${pageName}": ${stat.enqueued} enqueued, ${stat.matched} matched, ${stat.alreadyReplied} already replied`,
        payload: { ...stat },
      },
    })
    .catch(() => {});
}
