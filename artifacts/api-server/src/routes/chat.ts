// 채팅 로그 라우트
import { Router } from "express";
import type { IRouter } from "express";
import { db, chatMessagesTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// GET /api/chat/logs — 채팅 로그 조회
router.get("/chat/logs", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const channel = req.query.channel as string | undefined;
  const limit = parseInt(String(req.query.limit || "50"), 10);

  const messages = await db.select().from(chatMessagesTable)
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(Math.min(limit, 200));

  // 관리자 채널은 관리자만 볼 수 있음
  const filtered = messages.filter(m => {
    if (m.channel === "admin" && user.role !== "admin" && user.role !== "master") return false;
    if (channel && m.channel !== channel) return false;
    return true;
  }).reverse();

  res.json(filtered);
});

export default router;
