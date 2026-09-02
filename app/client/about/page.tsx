import { GlassCard, PageTitle } from "../_components/ui";
import {
  ABOUT_CLUB_OUTRO,
  ABOUT_CLUB_PHOTO,
  ABOUT_CLUB_SECTIONS,
  ABOUT_CLUB_SUBTITLE,
  ABOUT_CLUB_TITLE,
  type AboutBlock,
} from "@/lib/client/about-club";

function Block({ block }: { block: AboutBlock }) {
  if (block.kind === "accent") {
    return (
      <GlassCard className="border-[#c8163f]/40 bg-[linear-gradient(135deg,rgba(200,22,63,0.18),rgba(200,22,63,0.04))] !p-[18px]">
        <p className="text-sm font-semibold leading-relaxed text-white/85">{block.text}</p>
      </GlassCard>
    );
  }

  if (block.kind === "group") {
    return (
      <GlassCard className="!p-[18px]">
        <p className="text-[15px] font-bold">{block.title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/55">{block.text}</p>
      </GlassCard>
    );
  }

  if (block.kind === "list") {
    return (
      <ul className="space-y-2">
        {block.items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-white/55">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e9c07a]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  return <p className="text-sm leading-relaxed text-white/55">{block.text}</p>;
}

export default function ClientAboutPage() {
  return (
    <div className="space-y-6 pt-1">

      <div className="overflow-hidden rounded-[22px] border border-white/[0.07] shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Турнирный вечер в MAJESTIC Poker Club"
          className="h-full w-full object-cover"
          src={ABOUT_CLUB_PHOTO}
        />
      </div>

      <div className="space-y-2">
        <PageTitle>{ABOUT_CLUB_TITLE}</PageTitle>
        <p className="text-sm leading-relaxed text-white/55">{ABOUT_CLUB_SUBTITLE}</p>
      </div>

      {ABOUT_CLUB_SECTIONS.map((section, sectionIndex) => (
        <section key={section.title ?? `intro-${sectionIndex}`} className="space-y-3">
          {section.title ? (
            <h2 className="text-[19px] font-bold tracking-tight text-white">{section.title}</h2>
          ) : null}
          {section.blocks.map((block, blockIndex) => (
            <Block key={`${sectionIndex}-${blockIndex}`} block={block} />
          ))}
        </section>
      ))}

      <GlassCard className="bg-[linear-gradient(135deg,rgba(233,192,122,0.16),rgba(200,22,63,0.08))] py-7 text-center">
        <p className="text-[15px] font-bold uppercase leading-relaxed tracking-[0.12em] text-[#e9c07a]">
          {ABOUT_CLUB_OUTRO}
        </p>
      </GlassCard>
    </div>
  );
}
