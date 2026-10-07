import { GlassCard, PageHeading } from "../_components/ui";
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
      <GlassCard className="border-club-rose/40 bg-club-crimson/10">
        <p className="text-sm font-semibold leading-relaxed text-club-text">{block.text}</p>
      </GlassCard>
    );
  }

  if (block.kind === "group") {
    return (
      <GlassCard className="flex flex-col gap-1.5">
        <p className="text-[15px] font-extrabold">{block.title}</p>
        <p className="text-sm leading-relaxed text-club-muted">{block.text}</p>
      </GlassCard>
    );
  }

  if (block.kind === "list") {
    return (
      <ul className="flex flex-col gap-2">
        {block.items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-club-muted">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-club-gold" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  return <p className="text-sm leading-relaxed text-club-muted">{block.text}</p>;
}

export default function ClientAboutPage() {
  return (
    // On a computer the photo stands beside the title and the opening words, and the
    // sections follow two across.
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:grid desk:grid-cols-2 desk:items-start desk:gap-x-8 desk:gap-y-8">
      <div className="overflow-hidden rounded-3xl border border-club-line desk:row-span-2 desk:h-full desk:min-h-[340px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Турнирный вечер в MAJESTIC Poker Club"
          className="h-full w-full object-cover"
          src={ABOUT_CLUB_PHOTO}
        />
      </div>

      <PageHeading subtitle={ABOUT_CLUB_SUBTITLE} title={ABOUT_CLUB_TITLE} />

      {ABOUT_CLUB_SECTIONS.map((section, sectionIndex) => (
        <section key={section.title ?? `intro-${sectionIndex}`} className="flex flex-col gap-3">
          {section.title ? (
            <h2 className="font-display text-[17px] font-semibold">{section.title}</h2>
          ) : null}
          {section.blocks.map((block, blockIndex) => (
            <Block key={`${sectionIndex}-${blockIndex}`} block={block} />
          ))}
        </section>
      ))}

      <GlassCard className="border-club-gold/30 bg-club-gold/[0.08] py-7 text-center desk:col-span-2">
        <p className="font-display text-[15px] font-semibold uppercase leading-relaxed tracking-[0.12em] text-club-gold">
          {ABOUT_CLUB_OUTRO}
        </p>
      </GlassCard>
    </div>
  );
}
