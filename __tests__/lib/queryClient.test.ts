import { createAppQueryClient } from "@/lib/queryClient";

describe("createAppQueryClient", () => {
  // supabase-js already retries reads (db.retry is switched off in the
  // provider so it no longer does); stacked on TanStack's three retries an
  // offline pull-to-refresh spun for half a minute.
  it("retries a failed read once", () => {
    const options = createAppQueryClient().getDefaultOptions();
    expect(options.queries?.retry).toBe(1);
  });

  it("keeps the persisted cache lifetimes", () => {
    const options = createAppQueryClient().getDefaultOptions();
    expect(options.queries?.gcTime).toBe(1000 * 60 * 60 * 24);
    expect(options.queries?.staleTime).toBe(1000 * 60 * 5);
  });
});
