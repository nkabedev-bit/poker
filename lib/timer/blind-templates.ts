import type { BlindLevel, BlindTemplate, BlindTemplateLevel } from "@/lib/timer/types";

const maxBlindTemplates = 20;

function normalizeTemplateName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 48);
}

export function toBlindTemplateLevels(levels: BlindLevel[]): BlindTemplateLevel[] {
  return levels.map((level, index) => ({
    levelOrder: index + 1,
    smallBlind: level.isBreak ? null : level.smallBlind,
    bigBlind: level.isBreak ? null : level.bigBlind,
    ante: level.isBreak ? null : 0,
    reentryCloses: level.isBreak ? false : Boolean(level.reentryCloses),
    durationSeconds: level.durationSeconds,
    isBreak: level.isBreak,
    breakDurationSeconds: level.isBreak ? level.breakDurationSeconds : null,
  }));
}

export function makeBlindTemplate(
  name: string,
  levels: BlindLevel[],
  id = crypto.randomUUID(),
): BlindTemplate {
  return {
    id,
    name: normalizeTemplateName(name),
    levels: toBlindTemplateLevels(levels),
  };
}

export function upsertBlindTemplate(
  templates: BlindTemplate[],
  template: BlindTemplate,
) {
  const normalizedName = template.name.toLocaleLowerCase("ru-RU");
  const rest = templates.filter(
    (item) => item.name.toLocaleLowerCase("ru-RU") !== normalizedName,
  );

  return [template, ...rest].slice(0, maxBlindTemplates);
}
