export type PlayerStats = {
  // Best number of knockouts in a single tournament (bounty shares, so a split knockout
  // counts as 0.5).
  bestTournamentBounty: number;
  // Longest run of tournaments finished outside the final table.
  bestMissStreak: number;
  // Longest run of tournaments finished at the final table (top-9).
  bestTop9Streak: number;
  eliminations: number;
  games: number;
  // Times the player was the first one out — the last place of the tournament.
  lastPlace: number;
  top9: number;
  top18: number;
  wins: number;
};

export type AchievementIcon =
  | "briefcase"
  | "check"
  | "compass"
  | "crown"
  | "dumbbell"
  | "flag"
  | "flame"
  | "heart"
  | "medal"
  | "megaphone"
  | "message"
  | "rocket"
  | "shark"
  | "star"
  | "sun"
  | "target"
  | "thumbs-up"
  | "trophy"
  | "wand"
  | "waves"
  | "zap";

export type Achievement = {
  description: string;
  earned: boolean;
  goal: number;
  icon: AchievementIcon;
  id: string;
  progress: number;
  title: string;
  value: number;
};

export type AchievementSection = {
  achievements: Achievement[];
  title: string;
};

type AchievementDefinition = {
  description: string;
  goal: number;
  icon: AchievementIcon;
  id: string;
  metric: keyof PlayerStats;
  title: string;
};

const ACHIEVEMENT_SECTIONS: { items: AchievementDefinition[]; title: string }[] = [
  {
    title: "Посещение игр",
    items: [
      { description: "Посети 1 игру", goal: 1, icon: "rocket", id: "debut", metric: "games", title: "Дебют!" },
      { description: "3 игры", goal: 3, icon: "message", id: "first-vibe", metric: "games", title: "Первый вайб" },
      { description: "10 игр", goal: 10, icon: "flag", id: "one-of-us", metric: "games", title: "Уже свой" },
      { description: "25 игр", goal: 25, icon: "thumbs-up", id: "atmosphere", metric: "games", title: "Часть атмосферы" },
      { description: "50 игр", goal: 50, icon: "crown", id: "resident", metric: "games", title: "Резидент клуба" },
      { description: "100 игр", goal: 100, icon: "flame", id: "living-legend", metric: "games", title: "Живая легенда" },
    ],
  },
  {
    title: "Попадания в топ-18",
    items: [
      { description: "3 раза", goal: 3, icon: "dumbbell", id: "in-rhythm", metric: "top18", title: "Поймал ритм" },
      { description: "10 раз", goal: 10, icon: "medal", id: "real-rival", metric: "top18", title: "Серьёзный соперник" },
      { description: "25 раз", goal: 25, icon: "star", id: "experienced", metric: "top18", title: "На опыте" },
      { description: "50 раз", goal: 50, icon: "sun", id: "elite", metric: "top18", title: "Элита" },
    ],
  },
  {
    title: "Победы",
    items: [
      { description: "1 победа", goal: 1, icon: "check", id: "first-trophy", metric: "wins", title: "Первый трофей" },
      { description: "3 победы", goal: 3, icon: "medal", id: "title-collector", metric: "wins", title: "Коллекционер титулов" },
      { description: "5 побед", goal: 5, icon: "megaphone", id: "well-known", metric: "wins", title: "Имя на слуху" },
      { description: "10 побед", goal: 10, icon: "trophy", id: "face-of-majestic", metric: "wins", title: "Лицо Majestic" },
    ],
  },
  {
    title: "Специальные достижения",
    items: [
      { description: "Последнее место", goal: 1, icon: "briefcase", id: "early-flight", metric: "lastPlace", title: "Ранний рейс" },
      { description: "5 баунти за турнир", goal: 5, icon: "target", id: "precise-aim", metric: "bestTournamentBounty", title: "Точный прицел" },
      { description: "10 баунти за турнир", goal: 10, icon: "zap", id: "table-storm", metric: "bestTournamentBounty", title: "Шторм за столом" },
      { description: "15 баунти за турнир", goal: 15, icon: "heart", id: "butcher", metric: "bestTournamentBounty", title: "Мясник" },
    ],
  },
  {
    title: "Попади в топ-9",
    items: [
      { description: "2 турнира подряд за финальным столом", goal: 2, icon: "waves", id: "caught-the-wave", metric: "bestTop9Streak", title: "Поймал волну" },
      { description: "3 турнира подряд за финальным столом", goal: 3, icon: "shark", id: "series-shark", metric: "bestTop9Streak", title: "Акула серии" },
      { description: "5 турниров подряд за финальным столом", goal: 5, icon: "compass", id: "perfect-distance", metric: "bestTop9Streak", title: "Идеальная дистанция" },
      { description: "5 вылетов без финального стола подряд", goal: 5, icon: "wand", id: "character-test", metric: "bestMissStreak", title: "Испытание характером" },
    ],
  },
];

// Knockouts are counted in bounty shares, so a value can be fractional; everything else
// is a plain counter.
function readMetric(stats: PlayerStats, metric: keyof PlayerStats) {
  const value = Number(stats[metric]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function buildAchievement(definition: AchievementDefinition, stats: PlayerStats): Achievement {
  const value = readMetric(stats, definition.metric);

  return {
    description: definition.description,
    earned: value >= definition.goal,
    goal: definition.goal,
    icon: definition.icon,
    id: definition.id,
    progress: Math.min(1, value / definition.goal),
    title: definition.title,
    value,
  };
}

export function getAchievementSections(stats: PlayerStats): AchievementSection[] {
  return ACHIEVEMENT_SECTIONS.map((section) => ({
    achievements: section.items.map((item) => buildAchievement(item, stats)),
    title: section.title,
  }));
}

export function getAchievements(stats: PlayerStats): Achievement[] {
  return getAchievementSections(stats).flatMap((section) => section.achievements);
}

export function countEarnedAchievements(achievements: Achievement[]) {
  return achievements.filter((achievement) => achievement.earned).length;
}

export const ACHIEVEMENTS_TOTAL = ACHIEVEMENT_SECTIONS.reduce(
  (total, section) => total + section.items.length,
  0,
);

export const EMPTY_PLAYER_STATS: PlayerStats = {
  bestMissStreak: 0,
  bestTop9Streak: 0,
  bestTournamentBounty: 0,
  eliminations: 0,
  games: 0,
  lastPlace: 0,
  top9: 0,
  top18: 0,
  wins: 0,
};
