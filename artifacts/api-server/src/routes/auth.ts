// 인증 라우트: 회원가입, 로그인, 로그아웃, 내 정보
import { Router } from "express";
import type { IRouter } from "express";
import { db, usersTable, gameStatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  requireAuth,
} from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /api/auth/register — 회원가입
router.post("/auth/register", async (req, res): Promise<void> => {
  const { username, password, nickname } = req.body;

  if (!username || !password || !nickname) {
    res.status(400).json({ error: "아이디, 비밀번호, 닉네임을 모두 입력해주세요" });
    return;
  }

  if (username.length < 3 || username.length > 20) {
    res.status(400).json({ error: "아이디는 3~20자여야 합니다" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "비밀번호는 6자 이상이어야 합니다" });
    return;
  }

  // 중복 확인
  const [existingUser] = await db.select().from(usersTable)
    .where(eq(usersTable.username, username));
  if (existingUser) {
    res.status(400).json({ error: "이미 사용 중인 아이디입니다" });
    return;
  }

  const [existingNickname] = await db.select().from(usersTable)
    .where(eq(usersTable.nickname, nickname));
  if (existingNickname) {
    res.status(400).json({ error: "이미 사용 중인 닉네임입니다" });
    return;
  }

  const hashedPassword = await hashPassword(password);

  // 첫 번째 유저는 마스터 관리자
  const userCount = await db.select().from(usersTable);
  const role = userCount.length === 0 ? "master" : "user";

  const [user] = await db.insert(usersTable).values({
    username,
    password: hashedPassword,
    nickname,
    role,
    currency: 100, // 시작 재화
  }).returning();

  // 게임 상태 초기화
  await db.insert(gameStatesTable).values({
    userId: user.id,
    level: 1,
    currency: 100,
    upgrades: {},
    position: { x: 0, y: 0, z: 0, mapId: "default" },
    stats: { kills: 0, deaths: 0, distance: 0, roomsExplored: 0 },
  });

  const token = generateToken(user.id, user.role);
  req.log.info({ userId: user.id, role }, "새 유저 가입");

  res.status(201).json({
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      currency: user.currency,
      equippedSkin: user.equippedSkin,
      isBanned: user.isBanned,
      totalScore: user.totalScore,
      playtime: user.playtime,
      createdAt: user.createdAt,
    },
  });
});

// POST /api/auth/login — 로그인
router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "아이디와 비밀번호를 입력해주세요" });
    return;
  }

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.username, username));

  if (!user) {
    res.status(401).json({ error: "아이디 또는 비밀번호가 틀렸습니다" });
    return;
  }

  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
    res.status(401).json({ error: "아이디 또는 비밀번호가 틀렸습니다" });
    return;
  }

  const token = generateToken(user.id, user.role);
  req.log.info({ userId: user.id }, "로그인");

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      currency: user.currency,
      equippedSkin: user.equippedSkin,
      isBanned: user.isBanned,
      totalScore: user.totalScore,
      playtime: user.playtime,
      createdAt: user.createdAt,
    },
  });
});

// POST /api/auth/logout — 로그아웃
router.post("/auth/logout", (req, res): void => {
  res.json({ message: "로그아웃되었습니다" });
});

// GET /api/auth/me — 현재 로그인한 유저 정보
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  res.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    currency: user.currency,
    equippedSkin: user.equippedSkin,
    isBanned: user.isBanned,
    totalScore: user.totalScore,
    playtime: user.playtime,
    createdAt: user.createdAt,
  });
});

export default router;
