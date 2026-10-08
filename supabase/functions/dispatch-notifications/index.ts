// dispatch-notifications — E5's dispatcher. Called every 5 minutes by the
// `dispatch-notifications` pg_cron job, never by the app. A courier: which
// habits are due (`enqueue_due_reminders`), what buddies did
// (`enqueue_social_events`) and which rows to push
// (`dispatchable_notifications`) are SQL, tested in
// `supabase/tests/reminders.sql` and `supabase/tests/social_events.sql`; the
// delivery loop is `dispatch.ts`.
//
//   POST {} with `Authorization: Bearer <DISPATCH_SECRET>`
//   → { enqueued: number, sent: number, failed: number }
//
// Deployed with `verify_jwt = false` (supabase/config.toml), like
// check-receipts: the caller is pg_cron with the shared secret.
//
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the
// platform; DISPATCH_SECRET and EXPO_ACCESS_TOKEN are the ones check-receipts
// and send-nudge already use.

import { createClient } from "npm:@supabase/supabase-js@2";

import { sendPushes } from "../send-nudge/expoPush.ts";
import { deliverAll, type Dispatchable } from "./dispatch.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const secret = Deno.env.get("DISPATCH_SECRET");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: fresh, error: enqueueError } = await admin.rpc(
    "enqueue_due_reminders",
  );
  if (enqueueError) {
    console.error("enqueue_due_reminders failed", enqueueError);
    return json({ error: "Could not enqueue reminders" }, 500);
  }

  const { data: social, error: socialError } = await admin.rpc(
    "enqueue_social_events",
  );
  if (socialError) {
    // Reminders are already queued; they still go out.
    console.error("enqueue_social_events failed", socialError);
  }
  const freshIds = [...(fresh ?? []), ...(social ?? [])] as string[];

  const { data: rows, error: rowsError } = await admin.rpc(
    "dispatchable_notifications",
    { p_fresh: freshIds },
  );
  if (rowsError) {
    console.error("dispatchable_notifications failed", rowsError);
    return json({ error: "Could not read the outbox" }, 500);
  }

  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  const result = await deliverAll({
    notifications: (rows ?? []) as Dispatchable[],
    tokensFor: async (userIds) => {
      const { data, error } = await admin
        .from("device_push_tokens")
        .select("user_id, expo_push_token")
        .in("user_id", userIds);
      if (error) throw error;
      const byUser: Record<string, string[]> = {};
      for (const r of data ?? []) {
        (byUser[r.user_id as string] ??= []).push(r.expo_push_token as string);
      }
      return byUser;
    },
    push: (tokens, notification) =>
      sendPushes({ tokens, notification, accessToken, fetchImpl: fetch }),
    record: async (id, tickets) => {
      const { error } = await admin.rpc("record_push_tickets", {
        p_notification: id,
        p_tickets: tickets,
      });
      if (error) throw error;
    },
  });

  return json({ enqueued: freshIds.length, ...result });
});
