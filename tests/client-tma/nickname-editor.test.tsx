/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NicknameEditor } from "@/app/client/_components/nickname-editor";

afterEach(() => cleanup());

function typeNickname(value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: /Новый ник/ }), { target: { value } });
}

describe("NicknameEditor", () => {
  it("opens on the current nickname and saves only a new one", async () => {
    const onSave = vi.fn(async () => null);
    render(<NicknameEditor availableAt={null} current="Mr.Fish" onClose={() => {}} onSave={onSave} />);

    const save = screen.getByRole("button", { name: "Сохранить" }) as HTMLButtonElement;
    expect((screen.getByRole("textbox", { name: /Новый ник/ }) as HTMLInputElement).value).toBe("Mr.Fish");
    expect(save.disabled).toBe(true);

    typeNickname("  Big   Fish ");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("Big Fish"));
  });

  it("keeps a single letter from being sent", () => {
    render(<NicknameEditor availableAt={null} current="Mr.Fish" onClose={() => {}} onSave={async () => null} />);

    typeNickname("A");

    expect((screen.getByRole("button", { name: "Сохранить" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows why the club turned the nickname down", async () => {
    render(
      <NicknameEditor
        availableAt={null}
        current="Mr.Fish"
        onClose={() => {}}
        onSave={async () => "Этот ник уже занят. Выберите другой."}
      />,
    );

    typeNickname("Chura");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Этот ник уже занят. Выберите другой.")).toBeTruthy();
  });

  it("only says when the next change opens inside the thirty days", () => {
    const onClose = vi.fn();
    render(
      <NicknameEditor
        availableAt="2026-11-08T10:00:00.000Z"
        current="Chura"
        onClose={onClose}
        onSave={async () => null}
      />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByText("Ник можно менять раз в 30 дней. Следующая смена — с 8 ноября."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Понятно" }));
    expect(onClose).toHaveBeenCalled();
  });
});
