export type PlayerStats = {
  eliminations: number;
  games: number;
  top9: number;
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
