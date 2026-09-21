import {
  Briefcase,
  Check,
  Clock,
  Compass,
  Crown,
  Dumbbell,
  Fish,
  Flag,
  Flame,
  Gift,
  Heart,
  Layers,
  Medal,
  Megaphone,
  MessageCircleHeart,
  Rocket,
  Shield,
  Star,
  Sun,
  Sunrise,
  Target,
  ThumbsUp,
  Ticket,
  Trophy,
  Wand2,
  Waves,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import type { AchievementIcon as AchievementIconName } from "@/lib/client/achievements";

type IconProps = { className?: string; size?: number; strokeWidth?: number };

/**
 * Пистолет для Dealer Revenge: в lucide оружия нет, поэтому свой контур — та же
 * сетка 24×24, та же толщина линии и скруглённые концы, чтобы он не выбивался из
 * ряда остальных медалей.
 */
const Pistol = ({ size = 24, ...props }: IconProps) => (
  <svg
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M3 7h17v4h-6l-2 6H8l-1-6H3z" />
    <path d="M13 11c0 1.7-1.3 3-3 3" />
  </svg>
);

const ICONS: Record<AchievementIconName, ComponentType<IconProps>> = {
  briefcase: Briefcase,
  check: Check,
  clock: Clock,
  compass: Compass,
  crown: Crown,
  dumbbell: Dumbbell,
  flag: Flag,
  flame: Flame,
  gift: Gift,
  heart: Heart,
  layers: Layers,
  medal: Medal,
  megaphone: Megaphone,
  message: MessageCircleHeart,
  pistol: Pistol,
  rocket: Rocket,
  shark: Fish,
  shield: Shield,
  star: Star,
  sun: Sun,
  sunrise: Sunrise,
  target: Target,
  ticket: Ticket,
  "thumbs-up": ThumbsUp,
  trophy: Trophy,
  wand: Wand2,
  waves: Waves,
  zap: Zap,
};

export function AchievementIcon({
  className = "",
  name,
  size = 26,
}: {
  className?: string;
  name: AchievementIconName;
  size?: number;
}) {
  const Icon = ICONS[name] ?? Trophy;
  return <Icon className={className} size={size} strokeWidth={1.7} />;
}
