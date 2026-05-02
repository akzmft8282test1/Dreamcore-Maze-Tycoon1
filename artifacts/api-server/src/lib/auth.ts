// 인증 유틸리티: JWT 토큰 생성/검증, 비밀번호 해시
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const JWT_SECRET = process.env.SESSION_SECRET || "dreamcore-maze-secret-2024";
const JWT_EXPIRES = "7d";

// 비밀번호 해시 생성
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// 비밀번호 검증
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT 토큰 생성
export function generateToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// JWT 토큰 검증
export function verifyToken(token: string): { userId: number; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
  } catch {
    return null;
  }
}

// Express 미들웨어: 인증 필요
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "유효하지 않은 토큰입니다" });
    return;
  }

  // 유저 존재 여부 확인
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
  if (!user) {
    res.status(401).json({ error: "존재하지 않는 유저입니다" });
    return;
  }

  // req에 유저 정보 첨부
  (req as any).user = user;
  next();
}

// Express 미들웨어: 관리자 필요
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    const user = (req as any).user;
    if (user?.role !== "admin" && user?.role !== "master") {
      res.status(403).json({ error: "관리자 권한이 필요합니다" });
      return;
    }
    next();
  });
}

// Express 미들웨어: 마스터 관리자 필요
export async function requireMaster(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    const user = (req as any).user;
    if (user?.role !== "master") {
      res.status(403).json({ error: "마스터 관리자 권한이 필요합니다" });
      return;
    }
    next();
  });
}
