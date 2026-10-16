// The second half of send-nudge and send-cheer: once the SQL rules have
// written an outbox row, read it and the recipient's tokens as the service
// role, push through Expo, and hand the tickets to `record_push_tickets`.
// Throws on a database error; the caller logs it and leaves the row
// `pending` for the dispatcher to pick up.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { sendPushes } from "./expoPush.ts";

export async function deliverNotification(
  admin: SupabaseClient,
  notificationId: string,
): Promise<void> {
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
      // The id rides along so the tap handler can mark it read.
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
}
