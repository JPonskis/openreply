import { describe, expect, it } from "vitest";
import { parseFacebookCommentEvents } from "@/lib/meta/webhook";

const PAGE_ID = "1061951727001979";

function feedPayload(value: Record<string, unknown>) {
  return {
    object: "page",
    entry: [
      {
        id: PAGE_ID,
        time: 1787620000,
        changes: [{ field: "feed", value }],
      },
    ],
  } as unknown as Parameters<typeof parseFacebookCommentEvents>[0];
}

describe("parseFacebookCommentEvents", () => {
  it("parses a comment add on a Page post", () => {
    const events = parseFacebookCommentEvents(
      feedPayload({
        item: "comment",
        verb: "add",
        comment_id: "123_456",
        post_id: `${PAGE_ID}_789`,
        message: "QUALIFY",
        from: { id: "555", name: "Sharon K" },
      })
    );

    expect(events).toEqual([
      {
        pageId: PAGE_ID,
        commentId: "123_456",
        commentText: "QUALIFY",
        commenterId: "555",
        commenterName: "Sharon K",
        postId: `${PAGE_ID}_789`,
      },
    ]);
  });

  it("ignores non-page payloads entirely", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: PAGE_ID,
          time: 1,
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "1_2",
                post_id: "3_4",
                from: { id: "9" },
              },
            },
          ],
        },
      ],
    } as unknown as Parameters<typeof parseFacebookCommentEvents>[0];

    expect(parseFacebookCommentEvents(payload)).toEqual([]);
  });

  it("drops the Page's own comments — including our public replies", () => {
    const events = parseFacebookCommentEvents(
      feedPayload({
        item: "comment",
        verb: "add",
        comment_id: "123_457",
        post_id: `${PAGE_ID}_789`,
        message: "sent! check your DMs",
        from: { id: PAGE_ID, name: "Benefitsusa" },
      })
    );

    expect(events).toEqual([]);
  });

  it("drops edits and removes", () => {
    for (const verb of ["edited", "remove", "hide"]) {
      const events = parseFacebookCommentEvents(
        feedPayload({
          item: "comment",
          verb,
          comment_id: "123_458",
          post_id: `${PAGE_ID}_789`,
          message: "QUALIFY",
          from: { id: "555" },
        })
      );
      expect(events).toEqual([]);
    }
  });

  it("drops non-comment feed items (posts, reactions, shares)", () => {
    for (const item of ["post", "reaction", "share", "photo"]) {
      const events = parseFacebookCommentEvents(
        feedPayload({
          item,
          verb: "add",
          post_id: `${PAGE_ID}_789`,
          from: { id: "555" },
        })
      );
      expect(events).toEqual([]);
    }
  });

  it("drops comments missing an author or ids", () => {
    expect(
      parseFacebookCommentEvents(
        feedPayload({
          item: "comment",
          verb: "add",
          comment_id: "123_459",
          post_id: `${PAGE_ID}_789`,
          message: "QUALIFY",
        })
      )
    ).toEqual([]);

    expect(
      parseFacebookCommentEvents(
        feedPayload({
          item: "comment",
          verb: "add",
          post_id: `${PAGE_ID}_789`,
          message: "QUALIFY",
          from: { id: "555" },
        })
      )
    ).toEqual([]);
  });
});
