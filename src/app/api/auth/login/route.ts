import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { admins, loginAttempts } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { createToken } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (
      !username ||
      !password ||
      typeof username !== "string" ||
      typeof password !== "string"
    ) {
      return NextResponse.json(
        { error: "Логин и пароль обязательны" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Пароль должен содержать минимум 6 символов" },
        { status: 400 }
      );
    }

    // Check brute force protection
    const cutoff = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);
    const recentAttempts = await db
      .select()
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.ip, ip),
          gte(loginAttempts.attemptedAt, cutoff),
          eq(loginAttempts.success, false)
        )
      );

    if (recentAttempts.length >= MAX_ATTEMPTS) {
      return NextResponse.json(
        {
          error: `Слишком много попыток. Повторите через ${LOCKOUT_MINUTES} минут`,
        },
        { status: 429 }
      );
    }

    // Check if any admin exists
    const existingAdmins = await db.select().from(admins).limit(1);

    if (existingAdmins.length === 0) {
      // First login - create admin
      const hash = await bcrypt.hash(password, 12);
      const [newAdmin] = await db
        .insert(admins)
        .values({ username, passwordHash: hash })
        .returning();

      const token = await createToken(newAdmin.id, newAdmin.username);

      // Log successful attempt
      await db
        .insert(loginAttempts)
        .values({ ip, success: true });

      const response = NextResponse.json({
        success: true,
        isNew: true,
        message: "Администратор создан",
      });
      response.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 6,
        path: "/",
      });
      return response;
    }

    // Normal login
    const admin = await db
      .select()
      .from(admins)
      .where(eq(admins.username, username))
      .limit(1);

    if (admin.length === 0) {
      await db.insert(loginAttempts).values({ ip, success: false });
      return NextResponse.json(
        { error: "Неверный логин или пароль" },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, admin[0].passwordHash);
    if (!valid) {
      await db.insert(loginAttempts).values({ ip, success: false });
      return NextResponse.json(
        { error: "Неверный логин или пароль" },
        { status: 401 }
      );
    }

    // Successful login
    await db.insert(loginAttempts).values({ ip, success: true });

    const token = await createToken(admin[0].id, admin[0].username);
    const response = NextResponse.json({
      success: true,
      isNew: false,
    });
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 6,
      path: "/",
    });
    return response;
  } catch (e) {
    console.error("Login error:", e);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
