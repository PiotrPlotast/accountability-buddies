export type Goal = {
  id: string;
  title: string;
  user_id: string;
  completed_today: boolean;
  group_id: string;
};

export type Member = { user_id: string; full_name: string; goals: Goal[] };

export type GroupResult = {
  group_id: string;
  groups: {
    name: string;
    current_streak: number;
    invite_code: string;
    last_streak_date: string | null;
  } | null;
};
