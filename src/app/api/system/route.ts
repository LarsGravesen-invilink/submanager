import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cpus, freemem, totalmem } from "os";
import { execFile } from "child_process";
import { promisify } from "util";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

type CpuTimes = { idle: number; total: number };

function readCpuTimes(): CpuTimes {
  return cpus().reduce(
    (result, cpu) => {
      const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
      return { idle: result.idle + cpu.times.idle, total: result.total + total };
    },
    { idle: 0, total: 0 }
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
  return `${Math.round(bytes / 1024 ** 2)}MB`;
}

async function getCpuUsage(): Promise<string> {
  const before = readCpuTimes();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const after = readCpuTimes();
  const totalDelta = after.total - before.total;
  const idleDelta = after.idle - before.idle;
  if (totalDelta <= 0) return "—";
  return `${Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)))}%`;
}

async function getDiskUsage(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("df", ["-k", "/"], { timeout: 2000 });
    const columns = stdout.trim().split("\n").at(-1)?.trim().split(/\s+/);
    if (!columns || columns.length < 4) return "—";
    const total = Number(columns[1]) * 1024;
    const free = Number(columns[3]) * 1024;
    return `${formatBytes(free)}/${formatBytes(total)}`;
  } catch {
    return "—";
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const totalRam = totalmem();
    const usedRam = totalRam - freemem();
    const [cpu, disk] = await Promise.all([getCpuUsage(), getDiskUsage()]);

    return NextResponse.json(
      {
        time: new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }),
        cpu,
        ram: `${formatBytes(usedRam)}/${formatBytes(totalRam)}`,
        disk,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch {
    return NextResponse.json(
      { time: "—", cpu: "—", ram: "—", disk: "—" },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }
}
