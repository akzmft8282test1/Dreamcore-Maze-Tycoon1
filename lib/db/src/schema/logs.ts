// 서버 로그 및 이상 현상 테이블 스키마
import {
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export const logsTable = pgTable("logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),           // action | anomaly | admin | system
  message: text("message").notNull(),
  userId: integer("user_id"),             // 연관 유저 (없을 수도 있음)
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 이상 현상 로그 (이상 이동, 이상 수익 등)
export const anomalyLogsTable = pgTable("anomaly_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  nickname: text("nickname").notNull(),
  type: text("type").notNull(),           // abnormal_movement | abnormal_income | exploit
  detail: text("detail").notNull(),
  severity: text("severity").notNull().default("low"), // low | medium | high
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
