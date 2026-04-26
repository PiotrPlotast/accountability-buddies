export type Goal = {
  id: string;
  title: string;
  user_id: string;
  completed_today: boolean;
  group_id: string;
  icon: string | null;
  repeat_days: number[];
};

// Raw Supabase row from `goals` query with nested `logs` relation
export type GoalRow = {
  id: string;
  title: string;
  user_id: string;
  group_id: string;
  icon: string | null;
  repeat_days: number[];
  logs: { id: string }[];
};

// Raw Supabase row from `group_members` query
export type GroupMemberRow = {
  user_id: string;
  profiles: { full_name: string } | null;
};

export type Member = {
  user_id: string;
  full_name: string;
  goals: Goal[];
};

export type ProfileRow = {
  nickname: string | null;
  avatar_url: string | null;
};

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
