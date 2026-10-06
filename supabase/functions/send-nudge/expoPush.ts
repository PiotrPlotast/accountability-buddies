// The Expo half of send-nudge, kept free of Deno and of imports so Jest can
// run it as it stands (`__tests__/supabase/expoPush.test.ts`).
//
// It never throws. Whatever goes wrong — a 5xx, no network, a response
// missing tickets — comes back as an error ticket for each device it
// affected, and `record_push_tickets` decides what that means for the
// notification. A nudge is already stored by the time this runs, so a failed
// push must not turn into a failed request.

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Expo's documented maximum per request.
const BATCH_SIZE = 100;

export type PushNotification = {
  title: string;
  body: string;
  data: Record<string, unknown>;
};

// Expo's ticket, plus the token it belongs to — the shape
// `record_push_tickets(p_notification, p_tickets)` takes.
export type PushTicket = {
  token: string;
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoTicket = Omit<PushTicket, "token">;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const errorTickets = (tokens: string[], message: string): PushTicket[] =>
  tokens.map((token) => ({ token, status: "error", message }));

async function sendBatch(
  tokens: string[],
  notification: PushNotification,
  accessToken: string | undefined,
  fetchImpl: FetchLike,
): Promise<PushTicket[]> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const messages = tokens.map((to) => ({
    to,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    sound: "default",
    // Matches `defaultChannel` in app.json's expo-notifications plugin.
    channelId: "default",
  }));

  try {
    const res = await fetchImpl(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      return errorTickets(tokens, `Expo push API responded ${res.status}`);
    }
    const json = (await res.json()) as { data?: ExpoTicket[] };
    const tickets = Array.isArray(json.data) ? json.data : [];
    // Expo answers in request order, one ticket per message.
    return tokens.map((token, i): PushTicket =>
      tickets[i]
        ? { token, ...tickets[i] }
        : { token, status: "error", message: "No ticket returned" },
    );
  } catch (e) {
    return errorTickets(tokens, e instanceof Error ? e.message : String(e));
  }
}

export async function sendPushes({
  tokens,
  notification,
  accessToken,
  fetchImpl,
}: {
  tokens: string[];
  notification: PushNotification;
  accessToken?: string;
  fetchImpl: FetchLike;
}): Promise<PushTicket[]> {
  const tickets: PushTicket[] = [];
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    tickets.push(
      ...(await sendBatch(
        tokens.slice(i, i + BATCH_SIZE),
        notification,
        accessToken,
        fetchImpl,
      )),
    );
  }
  return tickets;
}
