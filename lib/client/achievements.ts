export type PlayerStats = {
  // Longest run of the club's tournaments attended without missing one.
  bestAttendanceStreak: number;
  // Most final tables inside any seven days.
  bestFinalsInWeek: number;
  // Best number of knockouts in a single tournament (bounty shares, so a split knockout
  // counts as 0.5).
  bestTournamentBounty: number;
  // Longest run of tournaments finished outside the final table.
  bestMissStreak: number;
  // Longest run of tournaments finished at the final table (top-9).
  bestTop9Streak: number;
  // Closed seasons in a row finished in the top ten of the rating.
  bestTopTenSeasonStreak: number;
  // Longest run of wins in the player's own games.
  bestWinStreak: number;
  // Podiums taken on the first bullet, with no re-entry bought that evening.
  cleanPodiums: number;
  // Wins taken on the first bullet, with no re-entry bought that evening.
  cleanWins: number;
  // Wins that ended a run of three or more tournaments outside the final table.
  comebackWins: number;
  eliminations: number;
  // Evenings the player sat down at a table before anybody else.
  firstSeated: number;
  games: number;
  // Newcomers the player brought in who have since reached a final table.
  invitedFinalists: number;
  // Newcomers the player brought in who came back for a second game.
  invitedPlayers: number;
  // Newcomers the player brought in who have played ten tournaments.
  invitedRegulars: number;
  // Evenings with a knockout to the player's name — a shared one included.
  knockoutGames: number;
  // Times the player was the first one out — the last place of the tournament.
  lastPlace: number;
  // How many of first, second and third place the player has ever taken.
  podiumPlaces: number;
  // Wins that took a re-entry to get there.
  reentryWins: number;
  top9: number;
  top3: number;
  wins: number;
};

export type AchievementIcon =
  | "alarm-clock"
  | "anvil"
  | "armchair"
  | "award"
  | "book"
  | "briefcase"
  | "calendar-check"
  | "calendar-range"
  | "check"
  | "clock"
  | "compass"
  | "crown"
  | "dumbbell"
  | "eye"
  | "flag"
  | "flame"
  | "gift"
  | "hammer"
  | "handshake"
  | "heart"
  | "heart-pulse"
  | "layers"
  | "medal"
  | "megaphone"
  | "message"
  | "party"
  | "pistol"
  | "podium"
  | "repeat"
  | "rocket"
  | "shark"
  | "shield"
  | "skull"
  | "sparkles"
  | "star"
  | "sunrise"
  | "sun"
  | "swords"
  | "target"
  | "ticket"
  | "thumbs-up"
  | "trophy"
  | "user-plus"
  | "users"
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

// Each section runs from the badge a player earns first up to the hardest one, so a goal
// never comes after a bigger one: new badges used to be added at the end of a section,
// and "Первый нокаут" ended up behind twelve bounties in one tournament.
const ACHIEVEMENT_SECTIONS: { items: AchievementDefinition[]; title: string }[] = [
  {
    title: "Посещение игр",
    items: [
      { description: "Посети 1 игру", goal: 1, icon: "rocket", id: "debut", metric: "games", title: "Дебют!" },
      { description: "3 игры", goal: 3, icon: "message", id: "first-vibe", metric: "games", title: "Первый вайб" },
      { description: "3 турнира клуба подряд без пропусков", goal: 3, icon: "calendar-check", id: "warm-up", metric: "bestAttendanceStreak", title: "Разогрев" },
      { description: "Первым сесть за стол на 3 турнирах", goal: 3, icon: "alarm-clock", id: "early-bird", metric: "firstSeated", title: "Раньше блайндов" },
      { description: "6 турниров клуба подряд без пропусков", goal: 6, icon: "hammer", id: "got-into-it", metric: "bestAttendanceStreak", title: "Втянулся" },
      { description: "9 турниров клуба подряд без пропусков", goal: 9, icon: "anvil", id: "iron-schedule", metric: "bestAttendanceStreak", title: "Железный график" },
      { description: "10 игр", goal: 10, icon: "flag", id: "one-of-us", metric: "games", title: "Уже свой" },
      { description: "25 игр", goal: 25, icon: "thumbs-up", id: "atmosphere", metric: "games", title: "Часть атмосферы" },
      { description: "50 игр", goal: 50, icon: "crown", id: "resident", metric: "games", title: "Резидент клуба" },
      { description: "100 игр", goal: 100, icon: "flame", id: "living-legend", metric: "games", title: "Живая легенда" },
    ],
  },
  {
    title: "Попади в топ-9",
    items: [
      { description: "Впервые попасть за финальный стол", goal: 1, icon: "armchair", id: "first-final", metric: "top9", title: "Первый финал" },
      { description: "2 финальных стола за 7 дней", goal: 2, icon: "calendar-range", id: "two-finals-week", metric: "bestFinalsInWeek", title: "Два финала за неделю" },
      { description: "2 турнира подряд за финальным столом", goal: 2, icon: "waves", id: "caught-the-wave", metric: "bestTop9Streak", title: "Поймал волну" },
      { description: "3 турнира подряд за финальным столом", goal: 3, icon: "shark", id: "series-shark", metric: "bestTop9Streak", title: "Акула серии" },
      { description: "5 турниров подряд за финальным столом", goal: 5, icon: "compass", id: "perfect-distance", metric: "bestTop9Streak", title: "Идеальная дистанция" },
      { description: "5 вылетов без финального стола подряд", goal: 5, icon: "wand", id: "character-test", metric: "bestMissStreak", title: "Испытание характером" },
    ],
  },
  {
    title: "Попадания в топ-3",
    items: [
      { description: "Впервые попасть в топ-3", goal: 1, icon: "award", id: "first-podium", metric: "top3", title: "Первый подиум" },
      { description: "Топ-3 без единого ребая", goal: 1, icon: "shield", id: "no-insurance", metric: "cleanPodiums", title: "Без страховки" },
      { description: "Занять 1-е, 2-е и 3-е место", goal: 3, icon: "podium", id: "full-podium", metric: "podiumPlaces", title: "Весь пьедестал" },
      { description: "5 раз", goal: 5, icon: "dumbbell", id: "in-rhythm", metric: "top3", title: "Поймал ритм" },
      { description: "10 раз", goal: 10, icon: "medal", id: "real-rival", metric: "top3", title: "Серьёзный соперник" },
      { description: "15 раз", goal: 15, icon: "star", id: "experienced", metric: "top3", title: "На опыте" },
      { description: "20 раз", goal: 20, icon: "sun", id: "elite", metric: "top3", title: "Элита" },
    ],
  },
  {
    title: "Победы",
    items: [
      { description: "1 победа", goal: 1, icon: "check", id: "first-trophy", metric: "wins", title: "Первый трофей" },
      { description: "Победа без единого ре-энтри", goal: 1, icon: "sparkles", id: "clean-win", metric: "cleanWins", title: "Чистая победа" },
      { description: "Победа после ре-энтри", goal: 1, icon: "heart-pulse", id: "second-life", metric: "reentryWins", title: "Вторая жизнь" },
      { description: "Победа после 3 вылетов без финалки подряд", goal: 1, icon: "sunrise", id: "comeback", metric: "comebackWins", title: "Возвращение" },
      { description: "2 победы подряд", goal: 2, icon: "repeat", id: "double", metric: "bestWinStreak", title: "Дубль" },
      { description: "3 победы", goal: 3, icon: "medal", id: "title-collector", metric: "wins", title: "Коллекционер титулов" },
      { description: "5 побед", goal: 5, icon: "megaphone", id: "well-known", metric: "wins", title: "Имя на слуху" },
      { description: "10 побед", goal: 10, icon: "trophy", id: "face-of-majestic", metric: "wins", title: "Лицо Majestic" },
    ],
  },
  {
    title: "Нокауты",
    items: [
      { description: "Первое выбивание соперника", goal: 1, icon: "swords", id: "first-knockout", metric: "knockoutGames", title: "Первый нокаут" },
      { description: "5 баунти за турнир", goal: 5, icon: "target", id: "precise-aim", metric: "bestTournamentBounty", title: "Точный прицел" },
      { description: "8 баунти за турнир", goal: 8, icon: "zap", id: "table-storm", metric: "bestTournamentBounty", title: "Шторм за столом" },
      { description: "12 баунти за турнир", goal: 12, icon: "heart", id: "butcher", metric: "bestTournamentBounty", title: "Мясник" },
      { description: "25 баунти за всё время", goal: 25, icon: "skull", id: "big-hunt", metric: "eliminations", title: "Большая охота" },
    ],
  },
  {
    title: "Специальные достижения",
    items: [
      { description: "Последнее место", goal: 1, icon: "briefcase", id: "early-flight", metric: "lastPlace", title: "Ранний рейс" },
      { description: "3 сезона подряд в топ-10 рейтинга", goal: 3, icon: "eye", id: "in-sight", metric: "bestTopTenSeasonStreak", title: "В поле зрения" },
    ],
  },
  {
    // A newcomer counts once they have come back for a second game: a friend who came
    // once to look is not yet somebody the club was brought.
    title: "Приглашения",
    items: [
      { description: "Привести нового игрока — после его 2-й игры", goal: 1, icon: "user-plus", id: "plus-one", metric: "invitedPlayers", title: "Плюс один" },
      { description: "Приглашённый впервые за финальным столом", goal: 1, icon: "handshake", id: "relay", metric: "invitedFinalists", title: "Передал эстафету" },
      { description: "Приглашённый сыграл 10 турниров", goal: 1, icon: "book", id: "preacher", metric: "invitedRegulars", title: "Настоящий проповедник" },
      { description: "Привести 3 новых игроков — после их 2-й игры", goal: 3, icon: "users", id: "full-table", metric: "invitedPlayers", title: "Собрал стол" },
      { description: "Привести 5 новых игроков — после их 2-й игры", goal: 5, icon: "party", id: "own-crew", metric: "invitedPlayers", title: "Своя компания" },
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

/** The achievement behind an address, or null for one the club does not hand out. */
export function findAchievement(id: string) {
  return getAchievements(EMPTY_PLAYER_STATS).find((achievement) => achievement.id === id) ?? null;
}

/** How many of the club's players hold each achievement, out of everyone who has played. */
export type AchievementRarity = { holders: Record<string, number>; players: number };

/** Share of the club's players holding an achievement, as Steam and PlayStation show it. */
export function formatRarityPercent(holders: number, players: number) {
  const percent = players > 0 ? (holders / players) * 100 : 0;

  // One holder among thousands still holds it; rounding them away to 0% would say otherwise.
  if (holders > 0 && percent < 0.1) return "<0,1%";

  return `${percent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

export function formatAchievementRarity(holders: number, players: number) {
  return holders > 0 && players > 0
    ? `Есть у ${formatRarityPercent(holders, players)} игроков`
    : "Пока ни у кого";
}

export const ACHIEVEMENTS_TOTAL = ACHIEVEMENT_SECTIONS.reduce(
  (total, section) => total + section.items.length,
  0,
);

export const EMPTY_PLAYER_STATS: PlayerStats = {
  bestAttendanceStreak: 0,
  bestFinalsInWeek: 0,
  bestMissStreak: 0,
  bestTop9Streak: 0,
  bestTopTenSeasonStreak: 0,
  bestTournamentBounty: 0,
  bestWinStreak: 0,
  cleanPodiums: 0,
  cleanWins: 0,
  comebackWins: 0,
  eliminations: 0,
  firstSeated: 0,
  games: 0,
  invitedFinalists: 0,
  invitedPlayers: 0,
  invitedRegulars: 0,
  knockoutGames: 0,
  lastPlace: 0,
  podiumPlaces: 0,
  reentryWins: 0,
  top9: 0,
  top3: 0,
  wins: 0,
};
