// The delivery loop of dispatch-notifications, kept free of Deno so Jest can
// run it as it stands (`__tests__/supabase/dispatch.test.ts`). The database
// and Expo are passed in.
//
// One notification's failure never stops the rest: its row stays `pending`
// and dispatchable_notifications() offers it again on the next run, for up to
// an hour.

import type { PushNotification, PushTicket } from "../send-nudge/expoPush.ts";

export type Dispatchable = {
  id: string;
  recipient_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

export async function deliverAll({
  notifications,
  tokensFor,
  push,
  record,
}: {
  notifications: Dispatchable[];
  tokensFor: (userIds: string[]) => Promise<Record<string, string[]>>;
  push: (
    tokens: string[],
    notification: PushNotification,
  ) => Promise<PushTicket[]>;
  record: (notificationId: string, tickets: PushTicket[]) => Promise<void>;
}): Promise<{ sent: number; failed: number }> {
  if (notifications.length === 0) return { sent: 0, failed: 0 };

  const recipients = [...new Set(notifications.map((n) => n.recipient_id))];
  const tokens = await tokensFor(recipients);

  let sent = 0;
  let failed = 0;
  for (const n of notifications) {
    try {
      const tickets = await push(tokens[n.recipient_id] ?? [], {
        title: n.title,
        body: n.body,
        // The id rides along so a tap can mark it read, as with nudges.
        data: { ...n.data, notification_id: n.id },
      });
      await record(n.id, tickets);
      sent++;
    } catch (e) {
      console.error("dispatching notification", n.id, e);
      failed++;
    }
  }
  return { sent, failed };
}
