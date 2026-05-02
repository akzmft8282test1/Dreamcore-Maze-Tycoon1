// 명예의 전당 라우트
import { Router } from "express";
import type { IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/leaderboard — 상위 유저 목록
router.get("/leaderboard", async (_req, res): Promise<void> => {
  const topUsers = await db
    .select({
      id: usersTable.id,
      nickname: usersTable.nickname,
      totalScore: usersTable.totalScore,
      playtime: usersTable.playtime,
      equippedSkin: usersTable.equippedSkin,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.totalScore))
    .limit(50);

  const leaderboard = topUsers.map((user, index) => ({
    rank: index + 1,
    userId: user.id,
    nickname: user.nickname,
    totalScore: user.totalScore,
    playtime: user.playtime,
    equippedSkin: user.equippedSkin,
  }));

  res.json(leaderboard);
});

export default router;
