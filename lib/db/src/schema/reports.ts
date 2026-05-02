// 신고 테이블 스키마
import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull().references(() => usersTable.id),
  reporterNickname: text("reporter_nickname").notNull(),
  targetNickname: text("target_nickname").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // pending | reviewed | resolved | dismissed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
