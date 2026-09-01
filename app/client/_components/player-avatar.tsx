export function PlayerAvatar({
  name,
  photoUrl,
  size = 48,
}: {
  name: string;
  photoUrl?: string;
  size?: number;
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-[#b8163c] to-[#7d0d26] font-bold"
      style={{ height: size, width: size, fontSize: Math.round(size / 2.4) }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" src={photoUrl} />
      ) : (
        initial
      )}
    </span>
  );
}
