"use client";

import { useState } from "react";
import { toOwnOriginMediaUrl } from "@/lib/media/own-origin-url";

/**
 * A poster's artwork, filling the card behind its gradient.
 *
 * It fades in once it has loaded instead of popping in on top of the text: on a slow
 * connection the picture arrives seconds after the card, and a sudden jump read as the
 * screen breaking. `drift` gives the featured poster a slow push-in.
 */
export function PosterImage({ drift = false, url }: { drift?: boolean; url: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
        loaded ? "opacity-100" : "opacity-0"
      } ${drift ? "client-ken-burns" : ""}`}
      onLoad={() => setLoaded(true)}
      src={toOwnOriginMediaUrl(url)}
    />
  );
}
