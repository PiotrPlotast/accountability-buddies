// send-cheer — E7's courier, the twin of send-nudge. Every rule (shared group,
// the recipient's Social switch, one cheer per habit per day and one day
// cheer per buddy per day, the 140-character cap, the dedupe key) lives in
// `enqueue_cheer()` and is tested in `supabase/tests/send_cheer.sql`.
//
//   POST { recipient_id: string, message?: string | null,
//          goal_id?: string | null, day?: "YYYY-MM-DD" | null }
//   with the sender's `Authorization: Bearer <JWT>`
//   → { success: boolean, message: string }
//
// `goal_id` makes it a habit cheer, without it a day cheer. `day` is the day
// the cheer is about: the tapped push's `day`, or the phone's today.
//
// As with nudges, `enqueue_cheer` runs as the caller, only a new row is
// pushed, and once it exists the answer is success whatever Expo says.

import { createClient } from "npm:@supabase/supabase-js@2";

import { deliverNotification } from "../send-nudge/deliver.ts";

type EnqueueResult = {
  success: boolean;
  message: string;
  notification_id?: string | null;
};

const COULD_NOT_DELIVER = "Couldn't deliver that cheer";

const reply = (body: { success: boolean; message: string }, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : null;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return reply({ success: false, message: "Method not allowed" }, 405);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return reply({ success: false, message: "Not signed in" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ success: false, message: COULD_NOT_DELIVER }, 400);
  }
  if (typeof body?.recipient_id !== "string") {
    return reply({ success: false, message: COULD_NOT_DELIVER }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;

  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await asCaller.rpc("enqueue_cheer", {
    p_recipient: body.recipient_id,
    p_message: optionalString(body.message),
    p_goal: optionalString(body.goal_id),
    p_day: optionalString(body.day),
  });
  if (error) {
    // A malformed uuid or date lands here as well as an outage.
    console.error("enqueue_cheer failed", error);
    return reply({ success: false, message: COULD_NOT_DELIVER }, 500);
  }

  const result = data as EnqueueResult;
  if (!result.success || !result.notification_id) {
    return reply({ success: result.success, message: result.message });
  }

  try {
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    await deliverNotification(admin, result.notification_id);
  } catch (e) {
    // The row is stored and stays `pending`; the dispatcher picks it up.
    console.error("delivering cheer", result.notification_id, e);
  }

  return reply({ success: true, message: result.message });
});
