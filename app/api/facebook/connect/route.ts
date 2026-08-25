import { NextResponse } from "next/server";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";
import { getBaseUrl } from "@/lib/env";
import { createOAuthState } from "@/lib/meta/oauth";
import { getFacebookAuthorizationUrl } from "@/lib/meta/fb-client";

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.redirect(`${getBaseUrl()}/login`);
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.redirect(`${getBaseUrl()}/settings?facebook=forbidden`);
  }

  // Same rationale as the Instagram connect: surface a missing env var as a
  // readable redirect instead of a 500 on a plain <a> navigation.
  const missing = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"].filter(
    (name) => !process.env[name]
  );
  if (missing.length > 0) {
    return NextResponse.redirect(
      `${getBaseUrl()}/settings?facebook=misconfigured&missing=${encodeURIComponent(
        missing.join(",")
      )}`
    );
  }

  const redirectUri = `${getBaseUrl()}/api/facebook/callback`;
  const state = createOAuthState(context.workspaceId);

  return NextResponse.redirect(getFacebookAuthorizationUrl(redirectUri, state));
}
