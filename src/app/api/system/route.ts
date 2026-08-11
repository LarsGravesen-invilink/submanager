import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Moscow time
    const mskTime = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

    // CPU usage
    let cpuUsage = "—";
    try {
      const cpu = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'", { timeout: 3000 }).toString().trim();
      cpuUsage = `${parseFloat(cpu).toFixed(0)}%`;
    } catch {
      try {
        const loadavg = execSync("cat /proc/loadavg", { timeout: 2000 }).toString().trim().split(" ")[0];
        cpuUsage = `${loadavg}`;
      } catch { /* ignore */ }
    }

    // RAM
    let ramUsage = "—";
    try {
      const mem = execSync("free -m | awk '/^Mem:/{printf \"%d/%dMB\", $3, $2}'", { timeout: 3000 }).toString().trim();
      ramUsage = mem;
    } catch { /* ignore */ }

    // Disk
    let diskFree = "—";
    try {
      const disk = execSync("df -h / | awk 'NR==2{printf \"%s/%s\", $4, $2}'", { timeout: 3000 }).toString().trim();
      diskFree = disk;
    } catch { /* ignore */ }

    return NextResponse.json({ time: mskTime, cpu: cpuUsage, ram: ramUsage, disk: diskFree });
  } catch {
    return NextResponse.json({ time: "—", cpu: "—", ram: "—", disk: "—" });
  }
}
