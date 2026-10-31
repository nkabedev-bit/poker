async (page) => {
  const now = Date.now();
  const iso = (ms) => new Date(now + ms).toISOString();
  const json = (route, body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  const names = [
    ["Алексей К.", 7], ["Марина", 3], ["Дима Шарк", 11], ["Олег П.", 5], ["Катя", 14], ["Serg777", 9], ["Лёша", 2],
    ["Вадим", 16], ["Ира М.", 12], ["Пётр", 18], ["Артём", 6],
    ["Руслан", 23], ["Елена В.", 21],
  ];
  const players = names.map(([name, number], index) => {
    const table = index < 7 ? 1 : index < 11 ? 2 : 3;
    const seatInTable = index < 7 ? [1, 2, 3, 5, 6, 7, 9][index] : index < 11 ? [1, 2, 4, 6][index - 7] : [1, 3][index - 11];
    return {
      addons: index % 3 === 0 ? 1 : 0,
      addonChipsTotal: index % 3 === 0 ? 6000 : 0,
      bountyCount: index === 2 ? 2.5 : 0,
      doubleRebuys: 0,
      id: `p${index}`,
      name,
      rebuys: index === 2 || index === 3 ? 1 : 0,
      registrationNumber: number,
      seat: seatInTable,
      stack: 12000 + index * 2700,
      status: "active",
      table,
      ticketType: table === 3 ? "vip" : "regular",
    };
  });
  players.push({ id: "p-out1", name: "Глеб", registrationNumber: 4, seat: null, stack: 0, status: "eliminated", table: 2, rebuys: 1 });
  players.push({ id: "p-new", name: "Новичок", registrationNumber: null, seat: null, stack: 20000, status: "active", table: null });

  const levels = [
    [100, 200], [100, 200], [150, 300], [200, 400], null, [300, 600], [400, 800], [500, 1000],
  ].map((blinds, index) => ({
    ante: blinds && index > 4 ? blinds[1] : 0,
    big_blind: blinds ? blinds[1] : null,
    break_duration_seconds: blinds ? null : 600,
    double_reentry_available: index < 4,
    duration_seconds: 1200,
    id: `l${index}`,
    is_break: !blinds,
    level_order: index + 1,
    reentry_closes: index === 5,
    small_blind: blinds ? blinds[0] : null,
  }));
  const timerRow = {
    current_level_index: 3,
    finished_at: null,
    level_started_at: iso(-7 * 60e3 - 26e3),
    paused_remaining_seconds: null,
    registration_closes_at: null,
    status: "running",
  };

  const charge = (reentries, addons, free = false) => {
    const ticket = { count: 1, free, price: 1500, sum: free ? 0 : 1500 };
    const re = { count: reentries, price: 1500, sum: reentries * 1500 };
    const ad = { count: addons, price: 1000, sum: addons * 1000 };
    const dbl = { count: 0, price: 3000, sum: 0 };
    return { addons: ad, doubleReentries: dbl, reentries: re, ticket, total: ticket.sum + re.sum + ad.sum };
  };
  const card = (player, extra) => ({
    accountId: `acc-${player.id}`,
    addons: player.addons ?? 0,
    cardCode: `MJ-0${player.registrationNumber ?? 0}`,
    charge: charge(player.rebuys ?? 0, player.addons ?? 0),
    doubleReentries: 0,
    eliminated: player.status === "eliminated",
    freePass: false,
    name: player.name,
    paid: false,
    paidAt: null,
    playerId: player.id,
    reentries: player.rebuys ?? 0,
    registrationNumber: player.registrationNumber,
    seat: player.seat,
    table: player.table,
    telegramId: 1000,
    ticketType: player.ticketType ?? "regular",
    ...extra,
  });

  const event = (id, title, startsAt, extra = {}) => ({
    badge: null, buyIn: 1500, duoBuyIn: 2500, featuresText: "", id, isPublished: true, lateEntryUntil: null,
    maxDuoTickets: 4, maxPlayers: 44, maxVipPlayers: 10, posterUrl: null, publishAt: null, rulesText: "",
    signupsCount: 42, startingStack: 20000, startsAt, title, venueAddress: "", vipBuyIn: 3000, ...extra,
  });

  await page.route("**/api/tma/**", async (route) => {
    const url = route.request().url();
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const method = route.request().method();
    if (method !== "GET") return json(route, { ok: true });

    if (path === "/api/tma/pulse") return json(route, { version: "v1" });
    if (path === "/api/tma/players") {
      return json(route, {
        addonEnabled: true, bountyType: "standard", doubleReentryAvailable: true, isBounty: true,
        maxAddons: 1, maxReentries: 2, players, ptsBountyPoints: 5, reentryAvailable: true,
        reentryEnabled: true, tableFormats: [9, 9, 6], tablesCount: 3,
      });
    }
    if (path === "/api/tma/timer") {
      if (url.includes("scope=control")) {
        return json(route, {
          activeTables: [{ number: 1, players: 7 }, { number: 2, players: 4 }, { number: 3, players: 2 }],
          raffle: null,
          raffleHistory: [{ id: "r1", kind: "vip", winnerName: "Руслан", winnerNumber: 23 }],
          tableMerge: null,
          timerState: { status: "running" },
        });
      }
      return json(route, { blindLevels: levels, timerState: timerRow });
    }
    if (path === "/api/tma/cards" && url.includes("code=")) {
      return json(route, { session: card(players[2]) });
    }
    if (path === "/api/tma/cards") {
      return json(route, {
        cardsEnabled: true,
        issued: [
          card({ ...players[3], status: "eliminated" }),
          card(players[1]),
          card(players[9], { paid: true, paidAt: iso(-40 * 60e3) }),
        ],
      });
    }
    if (path === "/api/tma/event-signups") {
      return json(route, {
        event: { id: "e1", seatingOpen: true, startsAt: iso(-60 * 60e3), title: "Пятничный турнир" },
        events: [
          { id: "e1", signupsCount: 42, startsAt: iso(-60 * 60e3), title: "Пятничный турнир" },
          { id: "e2", signupsCount: 18, startsAt: iso(2 * 86400e3), title: "Bounty Sunday" },
        ],
        signups: [
          { id: "s1", name: "Игорь Н.", noShow: false, partnerName: null, reserved: false, seated: false, telegramId: 1, ticketType: "vip", usePass: "none", userId: "u1", username: "igorn" },
          { id: "s2", name: "Аня", noShow: false, partnerName: "Макс", reserved: false, seated: false, telegramId: 2, ticketType: "duo", usePass: "none", userId: "u2", username: "anya_p" },
          { id: "s3", name: "Kostya", noShow: false, partnerName: null, reserved: false, seated: false, telegramId: 3, ticketType: "regular", usePass: "regular", userId: "u3", username: null },
          { id: "s4", name: "Роман", noShow: false, partnerName: null, reserved: true, seated: false, telegramId: 4, ticketType: "regular", usePass: "none", userId: "u4", username: null },
          { id: "s5", name: "Лена", noShow: false, partnerName: null, reserved: false, seated: false, telegramId: null, ticketType: "regular", usePass: "none", userId: "u5", username: null },
          { id: "s6", name: "Глеб", noShow: true, partnerName: null, reserved: false, seated: false, telegramId: 6, ticketType: "regular", usePass: "none", userId: "u6", username: null },
          { id: "s7", name: "Марина", noShow: false, partnerName: null, reserved: false, seated: true, telegramId: 7, ticketType: "regular", usePass: "none", userId: "u7", username: null },
        ],
        tableFormats: [9, 9, 6],
        tablesCount: 3,
        waitlist: [
          { id: "w1", name: "Никита С.", offerExpiresAt: iso(30 * 60e3), seated: false, telegramId: 8, ticketType: "vip", userId: "u8", username: null },
          { id: "w2", name: "Вера", offerExpiresAt: null, seated: false, telegramId: 9, ticketType: "regular", userId: "u9", username: "vera" },
        ],
      });
    }
    if (path === "/api/tma/events") {
      return json(route, {
        events: [
          event("e1", "Пятничный турнир", iso(2 * 86400e3)),
          event("e2", "Bounty Sunday", iso(4 * 86400e3), { isPublished: false, publishAt: iso(86400e3), signupsCount: 0 }),
        ],
      });
    }
    if (path === "/api/tma/event-templates") return json(route, { templates: [] });
    if (path === "/api/tma/event-reservations") return json(route, { reservations: [] });
    if (path === "/api/tma/client-bot/settings") {
      return json(route, { ratingUrl: "https://docs.google.com/spreadsheets/d/x", scheduleText: "Пт 19:00 — Пятничный турнир", scheduleVersions: [] });
    }
    if (path === "/api/tma/client-bot/scheduled") {
      return json(route, {
        items: [
          { id: "b1", message: "Турнир в пятницу — осталось 12 мест", result: null, send_at: iso(-3600e3), sent_at: iso(-3600e3), status: "sent" },
          { id: "b2", message: "Итоги рейтинга сентября", result: null, send_at: iso(86400e3), sent_at: null, status: "pending" },
        ],
      });
    }
    if (path === "/api/tma/client-profile") {
      return json(route, {
        profile: {
          birthDate: "12.04.1991", discoverySource: "от друзей", displayName: "Дима Шарк",
          freeEntries: { regular: 1, vip: 0 }, fullName: "Дмитрий Шаров", invitedBy: "Олег П.",
          notificationsConsent: true, phone: "+7 900 000-00-00", ratingConsent: true,
          submittedAt: "2026-06-14T10:00:00Z", telegramId: 1000, username: "dimashark",
        },
      });
    }
    return json(route, {});
  });
}
