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
  name: string;
  current_streak: number;
  invite_code: string;
  last_streak_date: string | null;
  groups: {
    last_streak_date: string | null;
    current_streak: number;
  };
};
