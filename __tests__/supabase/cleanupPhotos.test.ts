import { cleanupPhotos } from "@/supabase/functions/cleanup-habit-photos/cleanup";

const files = (n: number, reason = "expired") =>
  Array.from({ length: n }, (_, i) => ({ path: `u/g/d/${i}.jpg`, reason }));

function deps(listed: { path: string; reason: string }[]) {
  const list = jest.fn(async () => listed);
  const remove = jest.fn(async (_paths: string[]) => {});
  const finish = jest.fn(async (deleted: string[]) => ({
    files: deleted.length,
    rows: 0,
  }));
  return { list, remove, finish };
}

describe("cleanupPhotos", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  // Finishing also deletes the rows of a finished day whose file went on an
  // earlier run, so it is called even when there is no file to remove.
  it("removes nothing but still finishes when nothing is listed", async () => {
    const d = deps([]);

    await expect(cleanupPhotos(d)).resolves.toEqual({
      listed: 0,
      deleted: 0,
      failed: 0,
      rows: 0,
    });
    expect(d.remove).not.toHaveBeenCalled();
    expect(d.finish).toHaveBeenCalledWith([]);
  });

  it("removes the listed files in batches and reports every one that went", async () => {
    const listed = files(250);
    const d = deps(listed);

    const result = await cleanupPhotos(d);

    expect(d.remove).toHaveBeenCalledTimes(3);
    expect(d.remove.mock.calls.map(([paths]) => paths.length)).toEqual([
      100, 100, 50,
    ]);
    expect(d.finish).toHaveBeenCalledWith(listed.map((f) => f.path));
    expect(result).toEqual({ listed: 250, deleted: 250, failed: 0, rows: 0 });
  });

  // The Storage API refused a batch: those files are still there, so their
  // rows must not be told otherwise. They're listed again next hour.
  it("leaves out a batch the Storage API refused, and carries on", async () => {
    const listed = files(150);
    const d = deps(listed);
    d.remove.mockImplementationOnce(async () => {
      throw new Error("storage unavailable");
    });

    const result = await cleanupPhotos(d);

    expect(d.remove).toHaveBeenCalledTimes(2);
    expect(d.finish).toHaveBeenCalledWith(listed.slice(100).map((f) => f.path));
    expect(result).toEqual({ listed: 150, deleted: 50, failed: 100, rows: 0 });
  });

  it("reports the rows the database deleted", async () => {
    const d = deps(files(2));
    d.finish.mockResolvedValueOnce({ files: 2, rows: 2 });

    await expect(cleanupPhotos(d)).resolves.toEqual(
      expect.objectContaining({ rows: 2 }),
    );
  });

  it("removes orphans the same way as photos", async () => {
    const d = deps([
      { path: "a.jpg", reason: "orphan" },
      { path: "b.jpg", reason: "removed" },
    ]);

    await cleanupPhotos(d);

    expect(d.remove).toHaveBeenCalledWith(["a.jpg", "b.jpg"]);
    expect(d.finish).toHaveBeenCalledWith(["a.jpg", "b.jpg"]);
  });
});
