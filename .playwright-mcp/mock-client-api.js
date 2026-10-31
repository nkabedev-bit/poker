async (page) => {
  const now = Date.now();
  const LEVEL_LEFT_SECONDS = 13;
  const iso = (ms) => new Date(now + ms).toISOString();
  const state = { signedUp: false, ticketType: "regular" };

  const event = (id, title, startsAt, extra = {}) => ({
    badge: null,
    buyIn: 1500,
    duoBuyIn: 2500,
    featuresText: "Баунти за каждого выбитого\nРе-энтри до 4 уровня",
    id,
    isPublished: true,
    lateEntryUntil: null,
    maxDuoTickets: 4,
    maxPlayers: 20,
    maxVipPlayers: 6,
    posterUrl: "/about-club.jpg",
    rulesText: "",
    startingStack: 20000,
    startsAt,
    title,
    venueAddress: "Петрозаводск, пр. Ленина, 1",
    vipBuyIn: 3000,
    ...extra,
  });

  const liveEvent = event("e-live", "Mystery Bounty", iso(-2 * 3600e3));
  const nextEvent = event("e-next", "Phoenix", iso(26 * 3600e3), { badge: "Глубокие стеки!" });
  const offerEvent = event("e-offer", "Deep Stack", iso(50 * 3600e3));

  const level = (order, small, big, ante = null) => ({
    ante,
    bigBlind: big,
    breakDurationSeconds: null,
    durationSeconds: 1200,
    isBreak: false,
    levelOrder: order,
    smallBlind: small,
  });
  const live = {
    activePlayers: 23,
    blindLevels: [level(1, 100, 200), level(2, 200, 400), level(3, 300, 600, 100), level(4, 400, 800, 100), level(5, 500, 1000, 200)],
    currentLevelIndex: 2,
    levelStartedAt: iso(-(1200 - LEVEL_LEFT_SECONDS) * 1000),
    levelsVersion: "v1",
    pausedRemainingSeconds: null,
    registrationClosesAt: iso(40 * 60e3),
    status: "running",
    totalPlayers: 40,
    tournamentName: "Mystery Bounty",
  };

  const names = ["Mr.Shark", "River", "Туз", "Blinder", "Kira", "Флоп", "Nuts", "Ривер", "Бадуги", "Jack", "Стрит", "Олл-ин", "Queen", "Сплэш", "Тёрн", "Кикер", "Батон"];
  const players = names.map((name, index) => ({
    avatarUrl: null,
    eliminations: 31 - index,
    games: 40 - index,
    hand: index === 0 ? "AsKs" : null,
    isMe: false,
    name,
    place: index + 1,
    points: [412, 455, 402, 301, 350][index] ?? 300 - index * 7,
    tier: index < 2 ? "legend" : index < 6 ? "core" : "member",
    top9: 20 - index,
  }));
  const me = { avatarUrl: null, eliminations: 8, games: 7, hand: "QsTs", isMe: true, name: "Ace_77", place: 18, points: 190, tier: "member", top9: 3 };
  const rating = {
    countedGames: null,
    me,
    players: [...players, me],
    season: { id: "s1", status: "open", title: "Осень 2026" },
    seasons: [
      { id: "s1", status: "open", title: "Осень 2026" },
      { id: "s0", status: "closed", title: "Лето 2026" },
    ],
  };

  const profile = {
    avatarIsCustom: false,
    avatarUrl: null,
    displayName: "Ace_77",
    favoriteHand: "QsTs",
    freeEntries: { regular: 1, vip: 1 },
    history: {
      active: [
        { event: nextEvent, status: "signed_up" },
        { event: offerEvent, status: "reserved" },
      ],
      past: [],
    },
    medals: { phoenix: 1 },
    profileSubmitted: true,
    registered: null,
    stats: { eliminations: 8, games: 7, top3: 1, top9: 3, wins: 1 },
    tier: "member",
    username: "ace77",
  };

  const seat = (id, name, extra = {}) => ({
    avatarUrl: null,
    bounties: null,
    finishPlace: null,
    hand: null,
    id,
    isMe: false,
    name,
    registrationNumber: Number(id.slice(1)),
    seat: Number(id.slice(1)) % 9 + 1,
    status: "active",
    ...extra,
  });
  const room = {
    eliminated: [seat("p9", "Кикер", { status: "eliminated", seat: null }), seat("p8", "Батон", { status: "eliminated", seat: null })],
    tables: [
      { number: 1, players: [seat("p1", "Ace_77", { isMe: true, hand: "QsTs" }), seat("p2", "Mr.Shark", { bounties: 2 }), seat("p3", "River")] },
      { number: 2, players: [seat("p4", "Туз"), seat("p5", "Kira", { bounties: 1 })] },
    ],
  };

  const eventDetails = (base, extra) => ({
    event: {
      ...base,
      cancellationClosed: false,
      partnerConfirmed: false,
      partnerIsMember: false,
      partnerName: null,
      reservedTicket: null,
      seatGivenAway: false,
      signedUp: false,
      signupsCount: 14,
      ticketType: "regular",
      usePass: "none",
      waitlisted: false,
      waitlistOfferExpiresAt: null,
      ...extra,
    },
    duoInvite: null,
    freeEntries: { heldFor: [], regular: 1, vip: 0 },
    freeSeats: { duo: 1, regular: 12, vip: 2 },
    live: null,
    signupBan: null,
  });

  const game = {
    game: { countsForRating: true, playedOn: iso(-3 * 86400e3), startedAt: "2026-09-26T16:00:00.000Z", title: "Phoenix" },
    rows: [
      { avatarUrl: null, hand: "AsKs", isMe: false, knockouts: 7, place: 1, playerName: "Mr.Shark", points: 455, tier: "legend" },
      { avatarUrl: null, hand: "QsTs", isMe: true, knockouts: 5, place: 2, playerName: "Ace_77", points: 431, tier: "member" },
      { avatarUrl: null, hand: null, isMe: false, knockouts: 3, place: 3, playerName: "Туз", points: 402, tier: "core" },
      { avatarUrl: null, hand: null, isMe: false, knockouts: 2, place: 4, playerName: "River", points: 380, tier: "legend" },
      { avatarUrl: null, hand: null, isMe: false, knockouts: 1, place: 5, playerName: "Blinder", points: 355, tier: "core" },
    ],
  };

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.route("**/api/client-tma/**", async (route) => {
    const request = route.request();
    const path = request.url().replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace("/api/client-tma", "");
    const method = request.method();
    const json = (body) => route.fulfill({ json: body });

    // Everything is answered a little late, the way the club's server answers from Russia.
    await page.waitForTimeout(700);

    if (path === "/me") return json(profile);
    if (path === "/rating") return json(rating);
    if (path === "/achievements") return json({ holders: { debut: 40, "first-vibe": 31 }, players: 40 });
    if (path === "/games") return json({ games: [{ knockouts: 5, place: 2, playedOn: game.game.playedOn, points: 431, startedAt: game.game.startedAt, title: "Phoenix" }], next: null });
    if (path.startsWith("/games/")) return json(game);
    if (path === "/live") return json({ live: { ...live, blindLevels: null } });
    if (path === "/live/tables") return json(room);
    if (path === "/events") {
      return json({
        events: [
          { ...liveEvent, signedUp: true, signupsCount: 38 },
          { ...nextEvent, signedUp: state.signedUp, signupsCount: state.signedUp ? 15 : 14 },
          { ...offerEvent, signedUp: false, signupsCount: 20, waitlisted: true, waitlistOffered: true },
        ],
        live,
        player: { avatarIsCustom: false, avatarUrl: null, canClaimProfile: false, displayName: "Ace_77", favoriteHand: "QsTs", profileSubmitted: true, username: "ace77" },
      });
    }
    if (path === "/events/e-next/signup") {
      if (method === "POST") {
        const body = JSON.parse(request.postData() || "{}");
        state.signedUp = true;
        state.ticketType = body.ticketType || "regular";
      } else {
        state.signedUp = false;
      }
      return json({ inviteLinks: null, ok: true });
    }
    if (path.endsWith("/signups")) {
      return json({
        players: ["Mr.Shark", "River", "Туз", "Kira"].map((name, index) => ({ avatarUrl: null, hand: index === 0 ? "AsKs" : null, isGuest: false, isMe: false, key: name, name, ticketType: index === 1 ? "vip" : "regular" })),
        waitlist: [],
      });
    }
    if (path === "/events/e-next") {
      return json(eventDetails(nextEvent, { signedUp: state.signedUp, signupsCount: state.signedUp ? 15 : 14, ticketType: state.ticketType }));
    }
    if (path === "/events/e-offer") {
      const details = eventDetails(offerEvent, { waitlisted: true, waitlistOfferExpiresAt: iso(4 * 60e3 + 20e3) });
      return json({ ...details, freeSeats: { duo: 0, regular: 0, vip: 0 } });
    }
    if (path === "/events/e-live") {
      return json({ ...eventDetails(liveEvent, { signedUp: true, signupsCount: 38 }), live });
    }

    return route.fulfill({ status: 404, json: { message: "not mocked" } });
  });

  return "mocked";
}
