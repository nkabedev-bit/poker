/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("allows logo files up to 4 MB", async () => {
    const { container } = render(
      <SettingsForm
        action={vi.fn()}
        extras={defaultTournamentExtras}
        publicUrl="/screen/demo"
        tournament={tournament}
      />,
    );

    expect(screen.getByText("PNG до 4 MB")).toBeTruthy();

    const input = container.querySelector<HTMLInputElement>('input[name="logo"]');
    expect(input).not.toBeNull();

    const file = new File([new Uint8Array(4 * 1024 * 1024)], "logo.png", {
      type: "image/png",
    });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Выбран: logo.png")).toBeTruthy();
    });

    expect(container.querySelector('input[name="logoDataUrl"]')).toBeNull();
  });

  it("rejects logo files larger than 4 MB", () => {
    const { container } = render(
      <SettingsForm
        action={vi.fn()}
        extras={defaultTournamentExtras}
        publicUrl="/screen/demo"
        tournament={tournament}
      />,
    );

    const input = container.querySelector<HTMLInputElement>('input[name="logo"]');
    expect(input).not.toBeNull();

    const file = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large-logo.png", {
      type: "image/png",
    });

    fireEvent.change(input!, { target: { files: [file] } });

    expect(screen.getByText("Файл больше 4 MB")).toBeTruthy();
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

  it("reorders blind levels and breaks with drag and drop", () => {
    const breakLevel: BlindLevel = {
      ...blindLevel,
      ante: null,
      bigBlind: null,
      breakDurationSeconds: 600,
      durationSeconds: 600,
      id: "break-1",
      isBreak: true,
      levelOrder: 2,
      smallBlind: null,
    };
    const secondBlindLevel: BlindLevel = {
      ...blindLevel,
      bigBlind: 400,
      id: "level-2",
      levelOrder: 3,
      smallBlind: 200,
    };

    const { container } = render(
      <BlindsEditor
        blindTemplates={[]}
        levels={[blindLevel, breakLevel, secondBlindLevel]}
        saveBlindTemplate={vi.fn()}
        saveLevels={vi.fn()}
      />,
    );

    const handles = screen.getAllByLabelText(/перетащить/i);
    fireEvent.dragStart(handles[1]);
    fireEvent.dragOver(handles[2]);
    fireEvent.drop(handles[2]);

    const serializedLevels = container.querySelector<HTMLInputElement>('input[name="levels"]');
    expect(serializedLevels).not.toBeNull();

    const nextLevels = JSON.parse(serializedLevels!.value) as BlindLevel[];
    expect(nextLevels.map((level) => level.id)).toEqual(["level-1", "level-2", "break-1"]);
    expect(nextLevels.map((level) => level.levelOrder)).toEqual([1, 2, 3]);
  });
});
