// cleanup-habit-photos — called once an hour by the `cleanup-habit-photos`
// pg_cron job, never by the app. A courier: which files to delete, and what
// becomes of their rows, is SQL (`habit_photo_files_to_delete`,
// `finish_habit_photo_cleanup`), tested in
// `supabase/tests/habit_photo_cleanup.sql`. The files go through the Storage
// API because hosted Supabase refuses a plain SQL delete on storage.objects.
//
//   POST {} with `Authorization: Bearer <DISPATCH_SECRET>`
//   → { listed, deleted, failed, rows }
//
// Deployed with `verify_jwt = false` (supabase/config.toml), like
// check-receipts: the caller is pg_cron with the shared DISPATCH_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";

import { cleanupPhotos, type ListedFile } from "./cleanup.ts";

const BUCKET = "habit-photos";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const secret = Deno.env.get("DISPATCH_SECRET");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const result = await cleanupPhotos({
      list: async () => {
        const { data, error } = await admin.rpc("habit_photo_files_to_delete");
        if (error) throw error;
        return (data ?? []) as ListedFile[];
      },
      remove: async (paths) => {
        const { error } = await admin.storage.from(BUCKET).remove(paths);
        if (error) throw error;
      },
      finish: async (deleted) => {
        const { data, error } = await admin.rpc("finish_habit_photo_cleanup", {
          p_deleted: deleted,
        });
        if (error) throw error;
        return data as { files: number; rows: number };
      },
    });
    return json(result);
  } catch (e) {
    console.error("cleanup-habit-photos failed", e);
    return json({ error: "Cleanup failed" }, 500);
  }
});
