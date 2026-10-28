import { filterGoalsForToday } from "@/lib/repeatDays";

type DayCompletable = {
  completed_today: boolean;
  repeat_days?: number[] | null;
};

// „Zamknięty dzień" — wszystkie dzisiejsze nawyki odhaczone.
//
// Jedna definicja dla dwóch odbiorców: `celebrate()` po ostatnim ticku (E1)
// i powiadomienie `buddy_done` (E5). Klient i SQL muszą się zgadzać, łącznie z
// konwencją Mon = 0 — po stronie SQL to `extract(isodow) - 1`.
//
// Pusty plan na dziś to `false`, nie `true`: dzień, w którym nic nie było
// zaplanowane, nie został zamknięty — nie ma czego świętować.
export function isDayComplete(goals: DayCompletable[]): boolean {
  const dueToday = filterGoalsForToday(goals);
  if (dueToday.length === 0) return false;
  return dueToday.every((goal) => goal.completed_today);
}

// Dzień, który liczy się do serii grupy — wystarczy jeden dzisiejszy nawyk
// odhaczony. Łagodniejsze niż `isDayComplete`: świętowanie i `buddy_done` dalej
// czekają na wszystkie. Po stronie SQL to `group_day_counts`, która żąda tego
// od każdego członka grupy, który ma coś na dziś.
export function countsForStreak(goals: DayCompletable[]): boolean {
  return filterGoalsForToday(goals).some((goal) => goal.completed_today);
}
