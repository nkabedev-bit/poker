import {
  Briefcase,
  Check,
  Compass,
  Crown,
  Dumbbell,
  Fish,
  Flag,
  Flame,
  Heart,
  Medal,
  Megaphone,
  MessageCircleHeart,
  Rocket,
  Star,
  Sun,
  Target,
  ThumbsUp,
  Trophy,
  Wand2,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AchievementIcon as AchievementIconName } from "@/lib/client/achievements";

const ICONS: Record<AchievementIconName, LucideIcon> = {
  briefcase: Briefcase,
  check: Check,
  compass: Compass,
  crown: Crown,
  dumbbell: Dumbbell,
  flag: Flag,
  flame: Flame,
  heart: Heart,
  medal: Medal,
  megaphone: Megaphone,
  message: MessageCircleHeart,
  rocket: Rocket,
  shark: Fish,
  star: Star,
  sun: Sun,
  target: Target,
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
