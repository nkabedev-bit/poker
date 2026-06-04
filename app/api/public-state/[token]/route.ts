import { NextResponse } from "next/server";
import { loadPublicState } from "@/lib/public-state";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const data = await loadPublicState(token);

    if (!data) {
      return NextResponse.json(
        { error: "Public screen not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load tournament state" },
      { status: 500 },
    );
  }
}
