// Habit photos: the client's half of the convention the migration
// (20261103120000_habit_photos.sql) enforces. One photo per habit per day,
// final; the group sees it until the end of the poster's day.

import type { Goal, HabitPhoto, Member } from "@/types/dashboardTypes";

export const PHOTO_BUCKET = "habit-photos";

// How long a signed URL works. Signed again before it runs out
// (`useHabitPhotoUrls`'s stale time is shorter).
export const SIGNED_URL_SECONDS = 60 * 60;

/** `<user>/<goal>/<day>/<id>.jpg` — exactly what `attach_habit_photo` checks. */
export function photoPath(
  userId: string,
  goalId: string,
  day: string,
  id: string,
): string {
  return `${userId}/${goalId}/${day}/${id}.jpg`;
}

/** The photo to show, or null: none today, or removed. */
export function livePhoto(goal: Goal): HabitPhoto | null {
  return goal.photo && !goal.photo.removed ? goal.photo : null;
}

/** Whether today's photo is used up, shown or not. A photo is final. */
export function photoSlotUsed(goal: Goal): boolean {
  return !!goal.photo;
}

/** Whether the camera is offered: a ticked habit, its photo unused, online. */
export function canAddPhoto(goal: Goal, isOnline: boolean): boolean {
  return isOnline && goal.completed_today && !photoSlotUsed(goal);
}

export type PhotoItem = {
  photo: HabitPhoto;
  goal: Goal;
  member: { userId: string; name: string };
};

/** Every live photo in the group, newest first: the strip and the viewer. */
export function todaysPhotos(members: Member[]): PhotoItem[] {
  return members
    .flatMap((m) =>
      m.goals.flatMap((goal) => {
        const photo = livePhoto(goal);
        return photo
          ? [{ photo, goal, member: { userId: m.user_id, name: m.full_name } }]
          : [];
      }),
    )
    .sort((a, b) => b.photo.createdAt.localeCompare(a.photo.createdAt));
}
