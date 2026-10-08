// The Expo half of check-receipts, kept free of Deno and of imports so Jest can
// run it as it stands (`__tests__/supabase/expoReceipts.test.ts`).
//
// It never throws. A batch that fails — a 5xx, no network, a response missing
// `data` — simply contributes no receipts, and its tickets stay unanswered in
// `push_tickets` for the next hourly run. Expo keeps a receipt for 24 hours,
// so one bad run loses nothing.

export const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

// Expo's documented maximum ids per request.
const BATCH_SIZE = 1000;

// Expo's receipt — the shape `record_push_receipts(p_receipts)` takes, keyed
// by ticket id.
export type PushReceipt = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

async function fetchBatch(
  ids: string[],
  accessToken: string | undefined,
  fetchImpl: FetchLike,
): Promise<Record<string, PushReceipt>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    const res = await fetchImpl(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      data?: Record<string, PushReceipt>;
    };
    return json.data && typeof json.data === "object" ? json.data : {};
  } catch {
    return {};
  }
}

export async function fetchReceipts({
  ticketIds,
  accessToken,
  fetchImpl,
}: {
  ticketIds: string[];
  accessToken?: string;
  fetchImpl: FetchLike;
}): Promise<Record<string, PushReceipt>> {
  const receipts: Record<string, PushReceipt> = {};
  for (let i = 0; i < ticketIds.length; i += BATCH_SIZE) {
    Object.assign(
      receipts,
      await fetchBatch(
        ticketIds.slice(i, i + BATCH_SIZE),
        accessToken,
        fetchImpl,
      ),
    );
  }
  return receipts;
}
