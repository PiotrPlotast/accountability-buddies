// The loop of cleanup-habit-photos, kept free of Deno so Jest can run it as
// it stands (`__tests__/supabase/cleanupPhotos.test.ts`). The database and
// the Storage API are passed in.
//
// Every rule (which files, when) is SQL: `habit_photo_files_to_delete()`
// lists them and `finish_habit_photo_cleanup(paths)` is told which went.
// A batch the Storage API refuses is left out of that report, so its rows
// keep their files and it is listed again on the next run.

export type ListedFile = { path: string; reason: string };

// The Storage API takes up to 1,000 paths a call; smaller batches keep one
// refusal from holding back a whole run.
const BATCH = 100;

export async function cleanupPhotos({
  list,
  remove,
  finish,
}: {
  list: () => Promise<ListedFile[]>;
  // Resolves once the files are gone (a path already missing counts as
  // gone); throws when the Storage API refuses.
  remove: (paths: string[]) => Promise<void>;
  finish: (deleted: string[]) => Promise<{ files: number; rows: number }>;
}): Promise<{ listed: number; deleted: number; failed: number; rows: number }> {
  const listed = await list();
  const deleted: string[] = [];
  let failed = 0;

  for (let i = 0; i < listed.length; i += BATCH) {
    const paths = listed.slice(i, i + BATCH).map((f) => f.path);
    try {
      await remove(paths);
      deleted.push(...paths);
    } catch (e) {
      console.error("removing habit photos", paths.length, e);
      failed += paths.length;
    }
  }

  // Called even with nothing deleted: it also drops the rows of a finished
  // day whose file went on an earlier run.
  const { rows } = await finish(deleted);
  return { listed: listed.length, deleted: deleted.length, failed, rows };
}
