/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlindsEditor } from "@/components/admin/blinds-editor";
import { SettingsForm } from "@/components/admin/settings-form";
import { defaultTournamentExtras } from "@/lib/tournament-extras-shared";
import type { BlindLevel, Tournament } from "@/lib/timer/types";

const tournament: Tournament = {
  id: "tournament-1",
  logoUrl: null,
  name: "Friday Poker",
  publicToken: "public-token",
  registrationMinutes: 120,
  registrationStatus: "open",
  startingStack: 10000,
};

const blindLevel: BlindLevel = {
  ante: 0,
  bigBlind: 200,
  breakDurationSeconds: null,
  durationSeconds: 1200,
  id: "level-1",
  isBreak: false,
  levelOrder: 1,
  reentryCloses: false,
  smallBlind: 100,
};

describe("re-entry settings UI", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows max re-entry count only when re-entry is enabled", () => {
    render(
      <SettingsForm
        action={vi.fn()}
        extras={defaultTournamentExtras}
        publicUrl="/screen/demo"
        tournament={tournament}
      />,
    );

    expect(screen.getByLabelText<HTMLSelectElement>(/включить ре-энтри/i).value).toBe("no");
    expect(screen.queryByLabelText(/кол-во ре-энтри/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/включить ре-энтри/i), {
      target: { value: "yes" },
    });

    expect(screen.getByLabelText<HTMLInputElement>(/кол-во ре-энтри/i).value).toBe("1");
  });

  it("hides re-entry cutoff controls when re-entry is disabled", () => {
    render(
      <BlindsEditor
        blindTemplates={[]}
        levels={[blindLevel]}
        reentryEnabled={false}
        saveBlindTemplate={vi.fn()}
        saveLevels={vi.fn()}
      />,
    );

    expect(screen.queryByText(/конец ре-энтри/i)).toBeNull();
    expect(screen.queryByLabelText(/конец ре-энтри/i)).toBeNull();
  });
});
