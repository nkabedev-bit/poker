import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/media/[...path]/route";

const fetchMock = vi.fn();

function request(path: string) {
  return new Request(`https://club.example/media/${path}`);
}

function params(path: string) {
  return { params: Promise.resolve({ path: path.split("?")[0].split("/") }) };
}

async function serve(path: string) {
  return GET(request(path), params(path));
}

function storageAnswer(body: string, init: ResponseInit) {
  return new Response(body, init);
}

describe("GET /media/[...path]", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fetches the photo from storage and hands it over whole", async () => {
    fetchMock.mockResolvedValue(
      storageAnswer("jpeg-bytes", { headers: { "content-type": "image/jpeg" }, status: 200 }),
    );

    const response = await serve("player-avatars/42.jpg?v=1757430000000");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/storage/v1/object/public/player-avatars/42.jpg?v=1757430000000",
      { cache: "no-store", signal: expect.any(AbortSignal) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(await response.text()).toBe("jpeg-bytes");
  });

  it("passes storage the version and nothing else", async () => {
    fetchMock.mockResolvedValue(
      storageAnswer("jpeg", { headers: { "content-type": "image/jpeg" }, status: 200 }),
    );

    await serve("player-avatars/42.jpg?v=3&download=1");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://project.supabase.co/storage/v1/object/public/player-avatars/42.jpg?v=3",
    );
  });

  // A new photo gets a new `?v=`, so the old address never has to be asked again.
  it("lets a versioned file be kept for good", async () => {
    fetchMock.mockResolvedValue(
      storageAnswer("webp", { headers: { "content-type": "image/webp" }, status: 200 }),
    );

    const response = await serve("player-avatars/thumbs/42.webp?v=1");

    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("cache-control")).toContain("s-maxage=31536000");
  });

  it("keeps an unversioned file for an hour, as storage does", async () => {
    fetchMock.mockResolvedValue(
      storageAnswer("png", { headers: { "content-type": "image/png" }, status: 200 }),
    );

    const response = await serve("tournament-logos/events/poster.png");

    expect(response.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=3600");
  });

  it("serves the break sound", async () => {
    fetchMock.mockResolvedValue(
      storageAnswer("mp3", { headers: { "content-type": "audio/mpeg" }, status: 200 }),
    );

    const response = await serve("tournament-sounds/t1/1757430000000-alert.mp3");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
  });

  it("refuses a bucket the club does not serve, without asking storage", async () => {
    const response = await serve("private-exports/list.csv");

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a path that tries to step out of the bucket", async () => {
    const response = await GET(request("player-avatars/x"), {
      params: Promise.resolve({ path: ["player-avatars", "..", "..", "rest", "v1", "users"] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses the bucket on its own", async () => {
    const response = await serve("player-avatars");

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Storage answers a missing file with 400 "not_found".
  it("answers 404 for a file storage does not have", async () => {
    fetchMock.mockResolvedValue(
      storageAnswer('{"statusCode":"404","error":"not_found"}', { status: 400 }),
    );

    const response = await serve("player-avatars/missing.jpg");

    expect(response.status).toBe(404);
  });

  // Anything on the club's domain runs with the club's cookies.
  it("never serves a file that is not a picture or a sound", async () => {
    fetchMock.mockResolvedValue(
      storageAnswer("<script>alert(1)</script>", {
        headers: { "content-type": "text/html" },
        status: 200,
      }),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await serve("tournament-logos/events/page.html");

    expect(response.status).toBe(404);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("will not open a served file as a page that can run anything", async () => {
    fetchMock.mockResolvedValue(
      storageAnswer("jpeg", { headers: { "content-type": "image/jpeg" }, status: 200 }),
    );

    const response = await serve("player-avatars/42.jpg");

    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("answers 502 when storage cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await serve("player-avatars/42.jpg");

    expect(response.status).toBe(502);
    error.mockRestore();
  });
});
