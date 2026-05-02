// 유저 테이블 스키마
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),        // 로그인 아이디
  password: text("password").notNull(),                // bcrypt 해시
  nickname: text("nickname").notNull().unique(),        // 인게임 닉네임
  role: text("role").notNull().default("user"),         // user | admin | master
  currency: integer("currency").notNull().default(0),  // 보유 재화
  equippedSkin: text("equipped_skin"),                 // 장착한 스킨 ID
  isBanned: boolean("is_banned").notNull().default(false), // 채팅 금지 여부
  totalScore: integer("total_score").notNull().default(0), // 누적 점수
  playtime: integer("playtime").notNull().default(0),  // 플레이 시간 (초)
  lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
