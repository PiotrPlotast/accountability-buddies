// check-receipts — E3 Phase 7. Called once an hour by the `check-push-receipts`
// pg_cron job, never by the app. A courier like send-nudge: every rule (which
// tickets to ask about, which errors delete a token, when a notification has
// failed, when a ticket expires) lives in `record_push_receipts()` and is
// tested in `supabase/tests/push_receipts.sql`.
//
//   POST {} with `Authorization: Bearer <DISPATCH_SECRET>`
//   → { checked: number, answered: number }
//
// Deployed with `verify_jwt = false` (supabase/config.toml): the caller is
// pg_cron with a shared secret, not a signed-in user, so the secret is checked
// here instead.
//
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the
// platform. DISPATCH_SECRET and EXPO_ACCESS_TOKEN are set with
// `npx supabase secrets set`; DISPATCH_SECRET must match Vault's
// `dispatch_secret`.

import { createClient } from "npm:@supabase/supabase-js@2";

import { fetchReceipts } from "./expoReceipts.ts";

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

  const { data: ids, error: pendingError } = await admin.rpc(
    "pending_push_receipts",
  );
  if (pendingError) {
    console.error("pending_push_receipts failed", pendingError);
    return json({ error: "Could not read tickets" }, 500);
  }

  const ticketIds = (ids ?? []) as string[];
  const receipts = await fetchReceipts({
    ticketIds,
    accessToken: Deno.env.get("EXPO_ACCESS_TOKEN"),
    fetchImpl: fetch,
  });

  // Called even with no receipts: it is also what expires day-old tickets.
  const { error: recordError } = await admin.rpc("record_push_receipts", {
    p_receipts: receipts,
  });
  if (recordError) {
    console.error("record_push_receipts failed", recordError);
    return json({ error: "Could not record receipts" }, 500);
  }

  return json({
    checked: ticketIds.length,
    answered: Object.keys(receipts).length,
  });
});
