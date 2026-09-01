export type PlayerStats = {
  eliminations: number;
  games: number;
  top9: number;
};

export type PlayerLevel = {
  next: { games: number; title: string } | null;
  progress: number;
  title: string;
};

export type Achievement = {
  description: string;
  earned: boolean;
  goal: number;
  id: string;
  progress: number;
  title: string;
  value: number;
};

// Club levels are earned by turning up: the ladder is deliberately readable at a
// glance rather than a formula nobody can reproduce at the table.
const LEVELS: { games: number; title: string }[] = [
  { games: 0, title: "FISH" },
  { games: 5, title: "SEMI-REG" },
  { games: 20, title: "REG" },
  { games: 50, title: "SHARK" },
  { games: 100, title: "LEGEND" },
];

export function getPlayerLevel(games: number): PlayerLevel {
  const played = Math.max(0, Math.floor(games));
  const currentIndex = LEVELS.reduce(
    (found, level, index) => (played >= level.games ? index : found),
    0,
  );
  const current = LEVELS[currentIndex];
  const next = LEVELS[currentIndex + 1] ?? null;

  if (!next) return { next: null, progress: 1, title: current.title };

  const span = next.games - current.games;
  const done = played - current.games;

  return {
    next: { games: next.games, title: next.title },
    progress: Math.min(1, Math.max(0, done / span)),
    title: current.title,
  };
}

const ACHIEVEMENTS: {
  description: string;
  goal: number;
  id: string;
  metric: keyof PlayerStats;
  title: string;
}[] = [
  { description: "Сыграть первый турнир", goal: 1, id: "first-game", metric: "games", title: "Первая игра" },
  { description: "Сыграть 10 турниров", goal: 10, id: "regular", metric: "games", title: "Завсегдатай" },
  { description: "Сыграть 50 турниров", goal: 50, id: "resident", metric: "games", title: "Резидент" },
  { description: "Выбить первого соперника", goal: 1, id: "first-blood", metric: "eliminations", title: "Первая кровь" },
  { description: "Выбить 25 соперников", goal: 25, id: "hunter", metric: "eliminations", title: "Охотник" },
  { description: "Выбить 100 соперников", goal: 100, id: "sniper", metric: "eliminations", title: "Снайпер" },
  { description: "Попасть в топ-9", goal: 1, id: "finalist", metric: "top9", title: "Финалист" },
  { description: "Попасть в топ-9 десять раз", goal: 10, id: "final-regular", metric: "top9", title: "Завсегдатай финалок" },
  { description: "Попасть в топ-9 тридцать раз", goal: 30, id: "final-boss", metric: "top9", title: "Хозяин финалок" },
];

export function getAchievements(stats: PlayerStats): Achievement[] {
  return ACHIEVEMENTS.map((achievement) => {
    const value = Math.max(0, Math.floor(Number(stats[achievement.metric]) || 0));

    return {
      description: achievement.description,
      earned: value >= achievement.goal,
      goal: achievement.goal,
      id: achievement.id,
      progress: Math.min(1, value / achievement.goal),
      title: achievement.title,
      value,
    };
  });
}

export function countEarnedAchievements(achievements: Achievement[]) {
  return achievements.filter((achievement) => achievement.earned).length;
}
