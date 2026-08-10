import { NextResponse } from "next/server";
import QRCode from "qrcode";

export async function POST(req: Request) {
  const { text } = await req.json();
  if (!text) {
    return NextResponse.json({ error: "Text required" }, { status: 400 });
  }

  const dataUrl = await QRCode.toDataURL(text, {
    width: 400,
    margin: 2,
    color: { dark: "#1a1a2e", light: "#ffffff" },
  });

  return NextResponse.json({ dataUrl });
}
