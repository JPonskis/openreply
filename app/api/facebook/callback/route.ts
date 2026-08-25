import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import {
  exchangeFacebookCode,
  getFacebookLongLivedToken,
  listManagedPages,
  subscribeFacebookPageToWebhooks,
} from "@/lib/meta/fb-client";
import { encryptToken, verifyOAuthState } from "@/lib/meta/oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

/**
 * Facebook Login callback: exchange the code, upgrade to a long-lived user
 * token (which makes the Page tokens from /me/accounts non-expiring), then
 * connect EVERY Page the user manages. Words are unique per tool across the
 * whole registry, so a campaign firing on whichever Page the comment landed on
 * is the desired behavior — connecting all Pages needs no per-page choice.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=invalid`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: state.workspaceId,
      userId: session.user.id,
    },
  });

  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=forbidden`);
  }

  try {
    const redirectUri = `${baseUrl}/api/facebook/callback`;
    const { accessToken: shortLivedToken } = await exchangeFacebookCode(
      code,
      redirectUri
    );
    const { accessToken: longLivedToken } =
      await getFacebookLongLivedToken(shortLivedToken);

    const pages = await listManagedPages(longLivedToken);
    if (pages.length === 0) {
      return NextResponse.redirect(`${baseUrl}/settings?facebook=no_pages`);
    }

    let connected = 0;
    for (const page of pages) {
      if (!page.access_token) continue;

      let webhookSubscribed = false;
      try {
        const subscription = await subscribeFacebookPageToWebhooks(
          page.id,
          page.access_token
        );
        webhookSubscribed = Boolean(subscription.success);
      } catch (subscriptionError) {
        console.warn(
          `[Facebook Callback] Webhook subscription failed for ${page.name}:`,
          subscriptionError
        );
      }

      await prisma.facebookPage.upsert({
        where: { pageId: page.id },
        create: {
          workspaceId: state.workspaceId,
          pageId: page.id,
          name: page.name,
          category: page.category,
          accessToken: encryptToken(page.access_token),
          webhookSubscribed,
        },
        update: {
          workspaceId: state.workspaceId,
          name: page.name,
          category: page.category,
          accessToken: encryptToken(page.access_token),
          webhookSubscribed,
        },
      });
      connected += 1;
    }

    if (connected === 0) {
      return NextResponse.redirect(`${baseUrl}/settings?facebook=no_pages`);
    }

    return NextResponse.redirect(`${baseUrl}/dashboard?facebook_connected=${connected}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Facebook Callback] Error:", err);
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Facebook Page connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return NextResponse.redirect(
      `${baseUrl}/settings?facebook=failed&reason=${encodeURIComponent(
        message.slice(0, 200)
      )}`
    );
  }
}
