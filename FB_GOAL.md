# GOAL — the Facebook Pages lane (branch: fb-pages)

**The win.** Someone comments a TOOL_WORDS registry word on any Benefitsusa
Facebook Page post and gets the tool link as a private Messenger reply, with the
same rotating public comment reply, the same logs, the same click tracking, in
the same dashboard — as reliably as the Instagram lane that shipped 2026-08-24.
The 14 words work on BOTH platforms without configuring anything twice.

**The point.** Facebook is where the audience actually is (612 followers,
90K+/mo reach vs single digits everywhere else). The slate's captions promise
"comment QUALIFY and I'll send it" — on Facebook that promise is currently a
lie. This makes the biggest channel keep the promise. Real stressed people get
real help links instead of silence.

**The fake win.** A Facebook lane that demos on one test comment but silently
drops the traffic the IG lane would have caught: webhooks that stop when the
page token expires, a reconciler that never sweeps Pages, campaigns that must be
duplicated per-platform and drift apart, or errors that exit 0 (the standing
RESILIENCE law). If the FB lane can't be verified in the same DM Logs table with
the same SENT/click evidence, it is not done. Don't hand over a hollow win.

## Constraints
- Fork discipline: additive lane, minimal diff against upstream (diwenne ships
  near-daily; keep merges cheap). New files over edits where possible.
- Meta: Messenger private reply = ONE message per comment, within 7 days.
  Page webhooks: object "page", field "feed". Page token via FB Login +
  pages_manage_metadata / pages_read_engagement / pages_messaging.
- The existing 14 campaigns must gain FB coverage without re-entry (a campaign
  matches by word; platform is a delivery detail).
- Every write read back: DmLog row + Messenger delivery, never "the API said ok".

## Sequence
1. Schema: FacebookPage model + platform-aware DmLog/ProcessedComment/dedup.
2. lib/meta/fb-client.ts: private reply, public comment reply, page posts +
   comments fetch (reconciler), token debug.
3. Webhook: parse object "page" / feed comment events alongside "instagram".
4. Worker: platform switch on send + FB lane in the reconciler.
5. OAuth: connect-Facebook-Page flow (FB Login dialog, page picker, store page
   token encrypted).
6. Dashboard: page account card; campaigns show platform coverage.
7. Meta console (needs Jacob ~10 min): add FB Login product + Page webhook
   subscription, then live test on a real Page post.
