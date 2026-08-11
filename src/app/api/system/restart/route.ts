import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { exec } from "child_process";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Schedule restart in 2 seconds (so the response can be sent first)
    exec("sleep 2 && systemctl restart submanager", (err) => {
      if (err) console.error("Restart error:", err);
    });

    return NextResponse.json({ success: true, message: "Перезапуск запланирован" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
