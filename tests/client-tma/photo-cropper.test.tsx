/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoCropper } from "@/app/client/_components/photo-cropper";

const CROPPED = "data:image/jpeg;base64,Q1JPUA==";
const drawImage = vi.fn();

beforeEach(() => {
  drawImage.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(CROPPED);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Opens the cropper on a 4000×3000 camera photo; jsdom gives the frame its floor, 120 px. */
function openCropper({
  onCancel = vi.fn(),
  onSave = vi.fn(async () => true),
}: {
  onCancel?: () => void;
  onSave?: (dataUrl: string) => Promise<boolean>;
} = {}) {
  render(<PhotoCropper src="data:image/jpeg;base64,UEhPVE8=" onCancel={onCancel} onSave={onSave} />);

  const image = document.querySelector("img") as HTMLImageElement;
  Object.defineProperty(image, "naturalWidth", { value: 4000 });
  Object.defineProperty(image, "naturalHeight", { value: 3000 });
  fireEvent.load(image);

  return { image, onCancel, onSave };
}

/** The square of the photo the last save cut out: [x, y, side]. */
function lastCrop() {
  const call = drawImage.mock.calls.at(-1) ?? [];
  return [call[1], call[2], call[3]];
}

describe("PhotoCropper", () => {
  it("sends the middle square of a wide photo when saved untouched", async () => {
    const { onSave } = openCropper();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(CROPPED));
    expect(lastCrop()).toEqual([500, 0, 3000]);
    // Drawn into the 640-pixel square the server is sent.
    expect(drawImage.mock.calls[0].slice(5)).toEqual([0, 0, 640, 640]);
  });

  it("follows the photo dragged to the right, but never past its edge", async () => {
    const { onSave } = openCropper();
    const stage = screen.getByTestId("photo-cropper-stage");

    fireEvent.pointerDown(stage, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 300, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(lastCrop()).toEqual([0, 0, 3000]);
  });

  it("takes a closer square once the slider brings the photo in", async () => {
    const { onSave } = openCropper();

    fireEvent.change(screen.getByRole("slider", { name: "Приближение" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(lastCrop()).toEqual([1250, 750, 1500]);
  });

  it("stays open for another go when the photo was not stored", async () => {
    const onSave = vi.fn(async () => false);
    openCropper({ onSave });
    const save = screen.getByRole("button", { name: "Сохранить" }) as HTMLButtonElement;

    fireEvent.click(save);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(save.disabled).toBe(false));
    expect(screen.getByRole("dialog", { name: "Выбор кадра" })).toBeTruthy();
  });

  it("lets the player change their mind", () => {
    const { onCancel } = openCropper();

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(onCancel).toHaveBeenCalled();
  });

  it("holds Telegram's swipe-to-close back while the photo is framed", () => {
    const telegram = {
      disableVerticalSwipes: vi.fn(),
      enableVerticalSwipes: vi.fn(),
      isVersionAtLeast: () => true,
      isVerticalSwipesEnabled: true,
    };
    vi.stubGlobal("Telegram", { WebApp: telegram });

    const { unmount } = render(
      <PhotoCropper src="data:image/jpeg;base64,UEhPVE8=" onCancel={() => {}} onSave={async () => true} />,
    );

    expect(telegram.disableVerticalSwipes).toHaveBeenCalled();
    expect(telegram.enableVerticalSwipes).not.toHaveBeenCalled();

    unmount();

    expect(telegram.enableVerticalSwipes).toHaveBeenCalled();
  });
});
