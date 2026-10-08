import {
  EXPO_RECEIPTS_URL,
  fetchReceipts,
} from "@/supabase/functions/check-receipts/expoReceipts";

const idList = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => `ticket-${offset + i}`);

const response = (data: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }) as unknown as Response;

const bodyOf = (fetchImpl: jest.Mock, call = 0) =>
  JSON.parse(fetchImpl.mock.calls[call][1].body as string);

describe("fetchReceipts", () => {
  it("asks nothing and returns no receipts when there are no tickets", async () => {
    const fetchImpl = jest.fn();
    await expect(fetchReceipts({ ticketIds: [], fetchImpl })).resolves.toEqual(
      {},
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the ticket ids to Expo's receipts endpoint", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(response({ data: { "ticket-0": { status: "ok" } } }));

    await fetchReceipts({ ticketIds: ["ticket-0"], fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(EXPO_RECEIPTS_URL);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(bodyOf(fetchImpl)).toEqual({ ids: ["ticket-0"] });
  });

  it("sends the access token when there is one, and no header when not", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ data: {} }));

    await fetchReceipts({ ticketIds: ["a"], accessToken: "secret", fetchImpl });
    await fetchReceipts({ ticketIds: ["a"], fetchImpl });

    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer secret",
    );
    expect(fetchImpl.mock.calls[1][1].headers).not.toHaveProperty(
      "Authorization",
    );
  });

  it("returns Expo's receipts keyed by ticket id, errors included", async () => {
    const data = {
      "ticket-0": { status: "ok" },
      "ticket-1": {
        status: "error",
        message: "gone",
        details: { error: "DeviceNotRegistered" },
      },
    };
    const fetchImpl = jest.fn().mockResolvedValue(response({ data }));

    await expect(
      fetchReceipts({ ticketIds: idList(2), fetchImpl }),
    ).resolves.toEqual(data);
  });

  it("leaves out tickets Expo has no receipt for yet", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(response({ data: { "ticket-0": { status: "ok" } } }));

    await expect(
      fetchReceipts({ ticketIds: idList(2), fetchImpl }),
    ).resolves.toEqual({ "ticket-0": { status: "ok" } });
  });

  it("asks in batches of 1000 and merges the answers", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        response({ data: { "ticket-0": { status: "ok" } } }),
      )
      .mockResolvedValueOnce(
        response({ data: { "ticket-1000": { status: "ok" } } }),
      );

    const receipts = await fetchReceipts({
      ticketIds: idList(1001),
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchImpl, 0).ids).toHaveLength(1000);
    expect(bodyOf(fetchImpl, 1).ids).toEqual(["ticket-1000"]);
    expect(receipts).toEqual({
      "ticket-0": { status: "ok" },
      "ticket-1000": { status: "ok" },
    });
  });

  it("never throws: a failed batch yields no receipts, so it is asked again next run", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(
        response({ data: { "ticket-1000": { status: "ok" } } }),
      );

    await expect(
      fetchReceipts({ ticketIds: idList(1001), fetchImpl }),
    ).resolves.toEqual({ "ticket-1000": { status: "ok" } });
  });

  it("never throws on a network failure or a response with no data", async () => {
    const offline = jest.fn().mockRejectedValue(new Error("offline"));
    const empty = jest.fn().mockResolvedValue(response({ errors: ["nope"] }));

    await expect(
      fetchReceipts({ ticketIds: ["a"], fetchImpl: offline }),
    ).resolves.toEqual({});
    await expect(
      fetchReceipts({ ticketIds: ["a"], fetchImpl: empty }),
    ).resolves.toEqual({});
  });
});
