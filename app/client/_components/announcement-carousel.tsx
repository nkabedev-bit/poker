"use client";

import { Fragment, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronRight, Megaphone } from "lucide-react";
import { getClientTelegramWebApp, tickClientSelection, useClientTMA } from "../layout";
import { Eyebrow, IconTile } from "./ui";
import type { HomeAnnouncement } from "@/lib/client/home-announcements";

const CARD_CLASS =
  "flex h-full w-full items-center gap-3.5 rounded-[20px] border border-club-gold/30 bg-club-gold/[0.08] px-4 py-3.5 text-left";

function isTelegramLink(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "t.me" || host === "telegram.me" || host.endsWith(".t.me");
  } catch {
    return false;
  }
}

function AnnouncementSlide({ announcement }: { announcement: HomeAnnouncement }) {
  const { initData } = useClientTMA();
  const { linkUrl } = announcement;

  const body = (
    <>
      <IconTile className="!bg-club-gold/15">
        <Megaphone size={20} />
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Eyebrow className="!text-club-gold">Объявление клуба</Eyebrow>
        <p className="whitespace-pre-line break-words text-[14px] leading-snug">{announcement.message}</p>
      </div>
      {linkUrl ? <ChevronRight className="shrink-0 text-club-gold" size={18} /> : null}
    </>
  );

  if (!linkUrl) return <div className={CARD_CLASS}>{body}</div>;

  // Inside Telegram a t.me post opens in Telegram itself and any other site in the
  // phone's browser. On the web the link opens a new tab on its own: the Telegram script
  // is loaded there too, and its openers would take the whole app away.
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    const tg = getClientTelegramWebApp();
    if (!initData || !tg) return;

    const viaTelegram = isTelegramLink(linkUrl);
    if (viaTelegram ? !tg.openTelegramLink : !tg.openLink) return;

    event.preventDefault();
    tg.HapticFeedback?.impactOccurred("light");
    if (viaTelegram) tg.openTelegramLink?.(linkUrl);
    else tg.openLink?.(linkUrl);
  };

  return (
    <a
      className={`${CARD_CLASS} transition-transform active:scale-[0.98]`}
      href={linkUrl}
      rel="noopener noreferrer"
      target="_blank"
      onClick={open}
    >
      {body}
    </a>
  );
}

/**
 * The club's announcements at the top of the home screen. One card stands on its own;
 * several become a strip the player swipes through, the next card peeking from the edge
 * and the dots underneath saying how many there are. `trailing` is a card of the app's
 * own (the invitation to the web app), shown after the club's.
 */
export function AnnouncementCarousel({
  announcements,
  trailing,
}: {
  announcements: HomeAnnouncement[];
  trailing?: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const slides = announcements.map((announcement) => (
    <AnnouncementSlide key={announcement.id} announcement={announcement} />
  ));
  if (trailing) slides.push(<Fragment key="trailing">{trailing}</Fragment>);

  if (slides.length === 0) return null;
  if (slides.length === 1) return slides[0];

  /** The distance from one card to the next, the gap included. */
  const slideStep = (track: HTMLDivElement) => {
    const [first, second] = Array.from(track.children) as HTMLElement[];
    return second.offsetLeft - first.offsetLeft;
  };

  const followScroll = () => {
    const track = trackRef.current;
    if (!track) return;

    const step = slideStep(track);
    if (step <= 0) return;

    // The last card never reaches the left edge, so the end of the strip counts as it.
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    const index = atEnd ? slides.length - 1 : Math.round(track.scrollLeft / step);
    const next = Math.min(Math.max(index, 0), slides.length - 1);
    if (next === active) return;

    tickClientSelection();
    setActive(next);
  };

  const showSlide = (index: number) => {
    const track = trackRef.current;
    if (!track) return;

    setActive(index);
    track.scrollTo?.({ behavior: "smooth", left: index * slideStep(track) });
  };

  return (
    <section aria-label="Объявления клуба" aria-roledescription="карусель" className="flex flex-col gap-2">
      <div
        ref={trackRef}
        className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 [scrollbar-width:none] md:mx-0 md:scroll-px-0 md:px-0 [&::-webkit-scrollbar]:hidden"
        onScroll={followScroll}
      >
        {slides.map((slide, index) => (
          <div
            key={slide.key}
            aria-label={`${index + 1} из ${slides.length}`}
            aria-roledescription="слайд"
            className="w-[86%] shrink-0 snap-start snap-always"
            role="group"
          >
            {slide}
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-0.5">
        {slides.map((slide, index) => (
          <button
            key={slide.key}
            aria-current={index === active}
            aria-label={`Объявление ${index + 1} из ${slides.length}`}
            className="flex h-4 items-center px-1"
            type="button"
            onClick={() => showSlide(index)}
          >
            <span
              className={`block h-1.5 rounded-full transition-all ${
                index === active ? "w-4 bg-club-gold" : "w-1.5 bg-club-line"
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
