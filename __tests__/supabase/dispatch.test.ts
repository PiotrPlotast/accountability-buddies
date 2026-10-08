import { deliverAll } from "@/supabase/functions/dispatch-notifications/dispatch";

const row = (id: string, recipient_id: string) => ({
  id,
  recipient_id,
  title: `title ${id}`,
  body: `body ${id}`,
  data: { type: "reminder", goal_id: `goal-${id}` },
});

const okTicket = (token: string) => ({ token, status: "ok" as const, id: "t" });

function deps(tokens: Record<string, string[]>) {
  const tokensFor = jest.fn(async (userIds: string[]) =>
    Object.fromEntries(userIds.map((u) => [u, tokens[u] ?? []])),
  );
  const push = jest.fn(async (toks: string[]) => toks.map(okTicket));
  const record = jest.fn(async () => {});
  return { tokensFor, push, record };
}

describe("deliverAll", () => {
  it("does nothing when there is nothing to send", async () => {
    const d = deps({});
    await expect(deliverAll({ notifications: [], ...d })).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(d.tokensFor).not.toHaveBeenCalled();
    expect(d.push).not.toHaveBeenCalled();
  });

  it("pushes each notification to its recipient's devices, with its id in the data", async () => {
    const d = deps({ ada: ["tok-a1", "tok-a2"], bob: ["tok-b"] });

    await deliverAll({
      notifications: [row("n1", "ada"), row("n2", "bob")],
      ...d,
    });

    expect(d.push).toHaveBeenCalledTimes(2);
    expect(d.push).toHaveBeenCalledWith(["tok-a1", "tok-a2"], {
      title: "title n1",
      body: "body n1",
      data: { type: "reminder", goal_id: "goal-n1", notification_id: "n1" },
    });
    expect(d.push).toHaveBeenCalledWith(["tok-b"], {
      title: "title n2",
      body: "body n2",
      data: { type: "reminder", goal_id: "goal-n2", notification_id: "n2" },
    });
  });

  it("hands each notification's tickets to record", async () => {
    const d = deps({ ada: ["tok-a"] });

    await deliverAll({ notifications: [row("n1", "ada")], ...d });

    expect(d.record).toHaveBeenCalledWith("n1", [okTicket("tok-a")]);
  });

  it("looks up tokens once, for every recipient", async () => {
    const d = deps({});

    await deliverAll({
      notifications: [row("n1", "ada"), row("n2", "ada"), row("n3", "bob")],
      ...d,
    });

    expect(d.tokensFor).toHaveBeenCalledTimes(1);
    expect(d.tokensFor).toHaveBeenCalledWith(["ada", "bob"]);
  });

  it("records an empty ticket list for a recipient with no devices", async () => {
    const d = deps({});

    await deliverAll({ notifications: [row("n1", "ada")], ...d });

    expect(d.record).toHaveBeenCalledWith("n1", []);
  });

  it("keeps going when one notification fails, and counts it", async () => {
    const d = deps({ ada: ["tok-a"], bob: ["tok-b"] });
    d.record.mockRejectedValueOnce(new Error("db down"));
    const log = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await deliverAll({
      notifications: [row("n1", "ada"), row("n2", "bob")],
      ...d,
    });

    expect(d.record).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 1, failed: 1 });
    log.mockRestore();
  });
});
