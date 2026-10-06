import {
  EXPO_PUSH_URL,
  sendPushes,
} from "@/supabase/functions/send-nudge/expoPush";

const notification = {
  title: "Ada nudged you",
  body: "What about your run?",
  data: { type: "nudge", sender_id: "ada" },
};

const tokenList = (n: number) =>
  Array.from({ length: n }, (_, i) => `ExponentPushToken[${i}]`);

const okResponse = (count: number, offset = 0) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      data: Array.from({ length: count }, (_, i) => ({
        status: "ok",
        id: `ticket-${offset + i}`,
      })),
    }),
  }) as unknown as Response;

const bodyOf = (fetchImpl: jest.Mock, call = 0) =>
  JSON.parse(fetchImpl.mock.calls[call][1].body as string);

describe("sendPushes", () => {
  it("sends nothing and returns no tickets when there are no devices", async () => {
    const fetchImpl = jest.fn();
    await expect(
      sendPushes({ tokens: [], notification, fetchImpl }),
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts one message per device to the Expo push API", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(2));
    await sendPushes({ tokens: tokenList(2), notification, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(EXPO_PUSH_URL);
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
    expect(bodyOf(fetchImpl)).toEqual(
      tokenList(2).map((to) => ({
        to,
        title: "Ada nudged you",
        body: "What about your run?",
        data: { type: "nudge", sender_id: "ada" },
        sound: "default",
        channelId: "default",
      })),
    );
  });

  it("sends the access token as a bearer header only when there is one", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(1));
    await sendPushes({
      tokens: tokenList(1),
      notification,
      accessToken: "secret",
      fetchImpl,
    });
    await sendPushes({ tokens: tokenList(1), notification, fetchImpl });

    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer secret",
    );
    expect(fetchImpl.mock.calls[1][1].headers).not.toHaveProperty(
      "Authorization",
    );
  });

  it("pairs each ticket with the token it was sent to, in order", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { status: "ok", id: "ticket-a" },
          {
            status: "error",
            message: "not registered",
            details: { error: "DeviceNotRegistered" },
          },
        ],
      }),
    });

    await expect(
      sendPushes({ tokens: ["tok-a", "tok-b"], notification, fetchImpl }),
    ).resolves.toEqual([
      { token: "tok-a", status: "ok", id: "ticket-a" },
      {
        token: "tok-b",
        status: "error",
        message: "not registered",
        details: { error: "DeviceNotRegistered" },
      },
    ]);
  });

  it("sends in batches of 100 and keeps the tickets in token order", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(okResponse(100, 0))
      .mockResolvedValueOnce(okResponse(50, 100));
    const tokens = tokenList(150);

    const tickets = await sendPushes({ tokens, notification, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchImpl, 0)).toHaveLength(100);
    expect(bodyOf(fetchImpl, 1)).toHaveLength(50);
    expect(tickets.map((t) => t.token)).toEqual(tokens);
    expect(tickets[149]).toEqual({
      token: tokens[149],
      status: "ok",
      id: "ticket-149",
    });
  });

  it("turns a failed batch into an error ticket per device, leaving other batches alone", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
      .mockResolvedValueOnce(okResponse(1, 100));
    const tokens = tokenList(101);

    const tickets = await sendPushes({ tokens, notification, fetchImpl });

    expect(tickets).toHaveLength(101);
    expect(tickets[0]).toEqual({
      token: tokens[0],
      status: "error",
      message: "Expo push API responded 503",
    });
    expect(tickets[100]).toEqual({
      token: tokens[100],
      status: "ok",
      id: "ticket-100",
    });
  });

  it("turns a network failure into error tickets instead of throwing", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("offline"));

    await expect(
      sendPushes({ tokens: ["tok-a"], notification, fetchImpl }),
    ).resolves.toEqual([
      { token: "tok-a", status: "error", message: "offline" },
    ]);
  });

  it("marks a device whose ticket is missing from the response as an error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ code: "VALIDATION_ERROR" }] }),
    });

    await expect(
      sendPushes({ tokens: ["tok-a"], notification, fetchImpl }),
    ).resolves.toEqual([
      { token: "tok-a", status: "error", message: "No ticket returned" },
    ]);
  });
});
