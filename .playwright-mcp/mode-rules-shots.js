async (page) => {
  const OUT = "/private/tmp/claude-501/-Users-nikitakabedev-Important-poker/186ed6e4-33cb-4e39-88c6-7ef7f52751b4/scratchpad/shots";
  const ORIGIN = "http://localhost:3101";
  const POINTS = {
    sport: [600, 480, 390, 320, 260, 220, 190, 160, 140, 120, 100, 90, 80, 70, 60, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 5, 5],
    action: [450, 340, 280, 230, 190, 160, 140, 120, 105, 90, 85, 80, 75, 70, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 5],
    special: [550, 440, 360, 290, 240, 200, 170, 150, 130, 110, 95, 85, 75, 65, 55, 45, 40, 35, 30, 25, 20, 15, 10, 5, 5, 5, 5],
    last: [720, 565, 465, 380, 310, 260, 225, 195, 170, 140, 120, 110, 100, 85, 75, 65, 55, 50, 45, 40, 35, 25, 20, 15, 10, 5, 5],
  };
  const MODES = [
    ["phoenix", { tournamentFormat: "phoenix", addonEnabled: false, maxReentries: 1 }, POINTS.sport, 2000],
    ["progressive", { isBounty: true, bountyType: "progressive" }, POINTS.action, 2000],
    ["bounty", { isBounty: true, bountyType: "standard" }, POINTS.action, 2000],
    ["mystery", { isBounty: true, bountyType: "mystery" }, POINTS.special, 2000],
    ["deepstack", { tournamentFormat: "deepstack", addonEnabled: false, maxReentries: 3 }, POINTS.sport, 4000],
    ["freeroll", { tournamentFormat: "freeroll" }, POINTS.special, 2000],
    ["lastchance", {}, POINTS.last, 2000],
  ];
  const L = (o, bb, extra = {}) => ({ id: "l" + o, bigBlind: bb, smallBlind: bb / 2, durationSeconds: 900, isBreak: false, ...extra });
  const B = (o) => ({ id: "b" + o, durationSeconds: 600, isBreak: true });
  const d = { doubleReentryAvailable: true };
  const blindLevels = [L(1, 10), L(2, 20), L(3, 30), L(4, 50), B(5), L(6, 100, d), L(7, 150, d), L(8, 200, d), L(9, 300, d), L(10, 400, d), B(11), L(12, 600, { reentryCloses: true }), L(13, 800)];

  await page.setViewportSize({ width: 2000, height: 1125 });
  const done = [];
  for (const [preset, extraSettings, points, stack] of MODES) {
    const state = {
      tournament: { name: "Majestic", startingStack: stack },
      timerState: { status: "not_started", currentLevelIndex: 0, levelStartedAt: null, pausedRemainingSeconds: null, registrationClosesAt: null, finishedAt: null },
      blindLevels,
      extras: {
        settings: { tournamentPreset: preset, addonEnabled: true, addonChips: 6000, reentryEnabled: true, maxReentries: 3, isBounty: false, bountyType: "standard", tournamentFormat: "regular", ...extraSettings },
        players: [{ id: "p1", name: "Chura", stack: 2000, table: 1, seat: 1, rebuys: 0, addons: 0, bountyCount: 0, status: "active", finishPlace: null }],
        pts: { bountyPoints: 30, placePoints: points },
      },
    };
    await page.context().addCookies([{ name: "poker-demo-state", value: encodeURIComponent(JSON.stringify(state)), url: ORIGIN }]);
    await page.goto(ORIGIN + "/screen/demo");
    await page.waitForSelector(".mode-rules");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${preset}.png` });
    done.push(preset);
  }
  return done;
}
