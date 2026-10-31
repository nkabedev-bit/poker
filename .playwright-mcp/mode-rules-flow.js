async (page) => {
  const OUT = "/private/tmp/claude-501/-Users-nikitakabedev-Important-poker/186ed6e4-33cb-4e39-88c6-7ef7f52751b4/scratchpad/shots";
  const ORIGIN = "http://localhost:3101";
  const L = (o, bb, extra = {}) => ({ id: "l" + o, bigBlind: bb, smallBlind: bb / 2, durationSeconds: 900, isBreak: false, ...extra });
  const B = (o) => ({ id: "b" + o, durationSeconds: 600, isBreak: true });
  const blindLevels = [L(1, 10), L(2, 20), L(3, 30), L(4, 50), B(5), L(6, 100), L(7, 150), L(8, 200), L(9, 300), L(10, 400), B(11), L(12, 600, { reentryCloses: true })];
  const player = { id: "p1", name: "Chura", stack: 2000, table: 1, seat: 1, rebuys: 0, addons: 0, bountyCount: 0, status: "active", finishPlace: null };

  async function setState({ status, players, settings = {} }) {
    const state = {
      tournament: { name: "Majestic", startingStack: 2000 },
      timerState: {
        status,
        currentLevelIndex: 0,
        levelStartedAt: status === "running" ? new Date().toISOString() : null,
        pausedRemainingSeconds: null,
        registrationClosesAt: null,
        finishedAt: null,
      },
      blindLevels,
      extras: {
        settings: { tournamentPreset: "bounty", isBounty: true, bountyType: "standard", addonEnabled: true, addonChips: 6000, reentryEnabled: true, maxReentries: 3, ...settings },
        players,
        pts: { bountyPoints: 30, placePoints: [450, 340, 280] },
      },
    };
    await page.context().addCookies([{ name: "poker-demo-state", value: encodeURIComponent(JSON.stringify(state)), url: ORIGIN }]);
  }

  const visible = async () => (await page.locator(".mode-rules").count()) > 0;
  const results = {};
  await page.setViewportSize({ width: 1920, height: 1080 });

  await setState({ status: "not_started", players: [] });
  await page.goto(ORIGIN + "/screen/demo");
  await page.waitForTimeout(800);
  results.emptyRoster = await visible();

  // The first player sits down: the demo screen re-reads its state every five seconds.
  await setState({ status: "not_started", players: [player] });
  await page.waitForTimeout(6500);
  results.firstPlayer = await visible();

  // The admin presses start.
  await setState({ status: "running", players: [player] });
  await page.waitForTimeout(6500);
  results.afterStart = await visible();
  await page.screenshot({ path: `${OUT}/after-start.png` });

  await setState({ status: "not_started", players: [player], settings: { bountyType: "dealer" } });
  await page.goto(ORIGIN + "/screen/demo");
  await page.waitForTimeout(800);
  results.dealerRevenge = await visible();

  // A TV that is not 16:9: the slide keeps its shape inside dark margins.
  await setState({ status: "not_started", players: [player] });
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto(ORIGIN + "/screen/demo");
  await page.waitForTimeout(1200);
  const box = await page.locator(".mode-rules__stage").boundingBox();
  results.stage4x3 = box && { width: Math.round(box.width), height: Math.round(box.height), top: Math.round(box.y) };
  await page.screenshot({ path: `${OUT}/stage-4x3.png` });

  return results;
}
