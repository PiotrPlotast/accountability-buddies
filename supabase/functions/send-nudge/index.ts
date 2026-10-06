// send-nudge — E4's one Edge Function. A courier, not a judge: every rule
// (shared group, the recipient's switch, the limits, the 140-character cap,
// the dedupe key) lives in `enqueue_nudge()` and is tested in
// `supabase/tests/send_nudge.sql`.
//
//   POST { recipient_id: string, message?: string | null }
//   with the sender's `Authorization: Bearer <JWT>`
//   → { success: boolean, message: string }
//
// 1. `enqueue_nudge` runs *as the caller*, so `auth.uid()` is the sender and
//    nobody can nudge on someone else's behalf.
// 2. Only when it wrote a new row does the service role read the recipient's
//    tokens, push through Expo, and hand the tickets to
//    `record_push_tickets`. A double tap gets success and no second push.
// 3. Once the row exists the answer is success, whatever Expo says: the nudge
//    is stored, and a recipient with no phone registered is not something the
//    sender can fix.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// injected by the platform. EXPO_ACCESS_TOKEN is set with
// `npx supabase secrets set` and is required once Enhanced Security for Push
// Notifications is on in the Expo project.

import { createClient } from "npm:@supabase/supabase-js@2";

import { sendPushes } from "./expoPush.ts";

type EnqueueResult = {
  success: boolean;
  message: string;
  notification_id?: string | null;
};

const COULD_NOT_DELIVER = "Couldn't deliver that nudge";

const reply = (body: { success: boolean; message: string }, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return reply({ success: false, message: "Method not allowed" }, 405);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return reply({ success: false, message: "Not signed in" }, 401);
  }

  let recipientId: unknown;
  let message: unknown;
  try {
    ({ recipient_id: recipientId, message } = await req.json());
  } catch {
    return reply({ success: false, message: COULD_NOT_DELIVER }, 400);
  }
  if (typeof recipientId !== "string") {
    return reply({ success: false, message: COULD_NOT_DELIVER }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;

  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await asCaller.rpc("enqueue_nudge", {
    p_recipient: recipientId,
    p_message: typeof message === "string" ? message : null,
  });
  if (error) {
    // A malformed uuid lands here as well as an outage; neither is worth
    // describing to the sender.
    console.error("enqueue_nudge failed", error);
    return reply({ success: false, message: COULD_NOT_DELIVER }, 500);
  }

  const result = data as EnqueueResult;
  if (!result.success || !result.notification_id) {
    return reply({ success: result.success, message: result.message });
  }

  const notificationId = result.notification_id;
  try {
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: notification, error: readError } = await admin
      .from("notifications")
      .select("recipient_id, title, body, data")
      .eq("id", notificationId)
      .single();
    if (readError) throw readError;

    const { data: tokenRows, error: tokenError } = await admin
      .from("device_push_tokens")
      .select("expo_push_token")
      .eq("user_id", notification.recipient_id);
    if (tokenError) throw tokenError;

    const tickets = await sendPushes({
      tokens: (tokenRows ?? []).map((row) => row.expo_push_token as string),
      notification: {
        title: notification.title,
        body: notification.body,
        // The id rides along so the tap handler (step 3) can mark it read.
        data: { ...notification.data, notification_id: notificationId },
      },
      accessToken: Deno.env.get("EXPO_ACCESS_TOKEN"),
      fetchImpl: fetch,
    });

    const { error: recordError } = await admin.rpc("record_push_tickets", {
      p_notification: notificationId,
      p_tickets: tickets,
    });
    if (recordError) throw recordError;
  } catch (e) {
    // The row is stored and stays `pending`; E5's dispatcher picks it up.
    console.error("delivering nudge", notificationId, e);
  }

  return reply({ success: true, message: result.message });
});
