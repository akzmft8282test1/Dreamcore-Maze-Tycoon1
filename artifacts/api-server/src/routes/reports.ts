// 신고 시스템 라우트
import { Router } from "express";
import type { IRouter } from "express";
import { db, reportsTable, usersTable, logsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// GET /api/reports — 신고 목록 (관리자용)
router.get("/reports", requireAdmin, async (_req, res): Promise<void> => {
  const reports = await db
    .select()
    .from(reportsTable)
    .orderBy(desc(reportsTable.createdAt));

  res.json(reports);
});

// POST /api/reports — 신고 접수
router.post("/reports", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { targetNickname, reason } = req.body;

  if (!targetNickname || !reason) {
    res.status(400).json({ error: "신고 대상과 사유를 입력해주세요" });
    return;
  }

  const [report] = await db.insert(reportsTable).values({
    reporterId: user.id,
    reporterNickname: user.nickname,
    targetNickname,
    reason,
    status: "pending",
  }).returning();

  // 로그 저장
  await db.insert(logsTable).values({
    type: "action",
    message: `${user.nickname}이(가) ${targetNickname}을(를) 신고함: ${reason}`,
    userId: user.id,
  });

  res.status(201).json(report);
});

// PATCH /api/reports/:reportId — 신고 상태 변경 (관리자)
router.patch("/reports/:reportId", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.reportId) ? req.params.reportId[0] : req.params.reportId;
  const reportId = parseInt(raw, 10);
  const { status } = req.body;

  const [report] = await db.update(reportsTable)
    .set({ status })
    .where(eq(reportsTable.id, reportId))
    .returning();

  if (!report) {
    res.status(404).json({ error: "신고를 찾을 수 없습니다" });
    return;
  }

  res.json(report);
});

export default router;
