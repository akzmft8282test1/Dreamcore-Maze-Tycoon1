// 방명록 벽 테이블 스키마
import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const guestbookTable = pgTable("guestbook", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  nickname: text("nickname").notNull(),
  message: text("message").notNull(),
  wallId: text("wall_id").notNull().default("main"), // 어느 벽인지
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
