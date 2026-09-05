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
  type LucideIcon,
} from "lucide-react";
import type { AchievementIcon as AchievementIconName } from "@/lib/client/achievements";

const ICONS: Record<AchievementIconName, LucideIcon> = {
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
