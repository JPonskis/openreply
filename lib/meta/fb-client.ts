/**
 * Facebook Pages Graph client — the Facebook half of the Meta integration.
 *
 * Everything here runs on a PAGE access token (obtained through Facebook Login
 * and /me/accounts, see the /api/facebook routes), against graph.facebook.com.
 * The Instagram client (client.ts) is untouched; the two lanes share only the
 * error taxonomy and response handling.
 *
 * The one behavioral rule that shapes this file: Meta allows exactly ONE
 * private (Messenger) reply per Page comment, within 7 days of the comment.
 * The worker enforces the dedup; this client just delivers.
 */

import { getMetaGraphApiVersion, requireEnv } from "@/lib/env";
import { handleResponse } from "./client";

function fbGraphBase() {
  return `https://graph.facebook.com/${getMetaGraphApiVersion()}`;
}

export interface FacebookPageInfo {
  id: string;
  name: string;
  category?: string;
  access_token: string;
  tasks?: string[];
}

export interface FacebookComment {
  id: string;
  message?: string;
  from?: {
    id: string;
    name?: string;
  };
  created_time: string;
  // Present when the query asks for comments{from}: this comment's replies,
  // used to tell whether the Page has already answered it.
  comments?: {
    data?: { id: string; from?: { id: string; name?: string } }[];
  };
}

export interface FacebookPost {
  id: string;
  created_time: string;
}

interface MessageSendResponse {
  recipient_id?: string;
  message_id?: string;
}

// ─── OAuth (Facebook Login → Page tokens) ───────────────────────────────────

export function getFacebookAuthorizationUrl(
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: requireEnv("FACEBOOK_APP_ID"),
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_metadata",
      "pages_manage_engagement",
      "pages_messaging",
      "pages_read_user_content",
      "business_management",
    ].join(","),
  });

  return `https://www.facebook.com/${getMetaGraphApiVersion()}/dialog/oauth?${params.toString()}`;
}

export async function exchangeFacebookCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string }> {
  const url = new URL(`${fbGraphBase()}/oauth/access_token`);
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const data = await handleResponse<{ access_token: string }>(
    await fetch(url.toString())
  );
  return { accessToken: data.access_token };
}

export async function getFacebookLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const url = new URL(`${fbGraphBase()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const data = await handleResponse<{
    access_token: string;
    expires_in?: number;
  }>(await fetch(url.toString()));
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/**
 * The Pages the logged-in user manages, each with its own Page access token.
 * When the user token is long-lived, the Page tokens returned here do not
 * expire — which is why the callback exchanges for a long-lived token first.
 */
export async function listManagedPages(
  userAccessToken: string
): Promise<FacebookPageInfo[]> {
  const url = new URL(`${fbGraphBase()}/me/accounts`);
  url.searchParams.set("fields", "id,name,category,access_token,tasks");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", userAccessToken);

  const data = await handleResponse<{ data?: FacebookPageInfo[] }>(
    await fetch(url.toString())
  );
  return data.data ?? [];
}

/**
 * Subscribe the app to this Page's webhooks. Without this, Meta delivers no
 * "page" events for the Page no matter what the app-level webhook config says.
 */
export async function subscribeFacebookPageToWebhooks(
  pageId: string,
  pageAccessToken: string
): Promise<{ success?: boolean }> {
  const url = new URL(`${fbGraphBase()}/${pageId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "feed");
  url.searchParams.set("access_token", pageAccessToken);

  return handleResponse<{ success?: boolean }>(
    await fetch(url.toString(), { method: "POST" })
  );
}

// ─── Sending ────────────────────────────────────────────────────────────────

/**
 * Private reply to a Page comment as a plain text Messenger message.
 * One per comment, ever; within 7 days of the comment.
 */
export async function sendFacebookPrivateReply(
  pageAccessToken: string,
  pageId: string,
  commentId: string,
  message: string
): Promise<MessageSendResponse> {
  const response = await fetch(`${fbGraphBase()}/${pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      messaging_type: "RESPONSE",
      message: { text: message },
      access_token: pageAccessToken,
    }),
  });
  return handleResponse<MessageSendResponse>(response);
}

/**
 * Private reply delivered as a Messenger button template: body text plus
 * web_url buttons. Same shape the Instagram lane uses, so a campaign's
 * dmMessage + linkButtonLabel render identically on both platforms.
 */
export async function sendFacebookPrivateReplyWithLinkButton(
  pageAccessToken: string,
  pageId: string,
  commentId: string,
  text: string,
  buttons: Array<{ title: string; url: string }>
): Promise<MessageSendResponse> {
  const response = await fetch(`${fbGraphBase()}/${pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      messaging_type: "RESPONSE",
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text,
            buttons: buttons.map((b) => ({
              type: "web_url",
              url: b.url,
              title: b.title,
            })),
          },
        },
      },
      access_token: pageAccessToken,
    }),
  });
  return handleResponse<MessageSendResponse>(response);
}

/** Public reply under the comment, as the Page. */
export async function sendFacebookCommentReply(
  pageAccessToken: string,
  commentId: string,
  message: string
): Promise<{ id?: string }> {
  const response = await fetch(`${fbGraphBase()}/${commentId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: pageAccessToken }),
  });
  return handleResponse<{ id?: string }>(response);
}

// ─── Reading (polling reconciler) ───────────────────────────────────────────

export async function getFacebookPagePosts(
  pageAccessToken: string,
  pageId: string,
  limit: number
): Promise<FacebookPost[]> {
  const url = new URL(`${fbGraphBase()}/${pageId}/posts`);
  url.searchParams.set("fields", "id,created_time");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", pageAccessToken);

  const data = await handleResponse<{ data?: FacebookPost[] }>(
    await fetch(url.toString())
  );
  return data.data ?? [];
}

/**
 * Recent comments on one Page post, newest first, with each comment's replies
 * (for the has-the-Page-already-answered check). filter=stream flattens reply
 * threads so nested comments are seen too.
 */
export async function getRecentFacebookPostComments(
  pageAccessToken: string,
  postId: string,
  sinceMs: number
): Promise<FacebookComment[]> {
  const url = new URL(`${fbGraphBase()}/${postId}/comments`);
  url.searchParams.set(
    "fields",
    "id,message,from,created_time,comments.limit(25){id,from}"
  );
  url.searchParams.set("filter", "stream");
  url.searchParams.set("order", "reverse_chronological");
  url.searchParams.set("since", String(Math.floor(sinceMs / 1000)));
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", pageAccessToken);

  const data = await handleResponse<{ data?: FacebookComment[] }>(
    await fetch(url.toString())
  );
  return data.data ?? [];
}
