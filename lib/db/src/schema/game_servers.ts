// 게임 서버 테이블 스키마
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const gameServersTable = pgTable("game_servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id),
  mode: text("mode").notNull().default("explore"), // explore | liminal | party | team | backrooms
  maxPlayers: integer("max_players").notNull().default(8),
  currentPlayers: integer("current_players").notNull().default(0),
  isPublic: boolean("is_public").notNull().default(true),
  complexity: integer("complexity").notNull().default(5),      // 1~10 미로 복잡도
  trapRate: real("trap_rate").notNull().default(0.1),          // 함정 비율
  mapWarp: boolean("map_warp").notNull().default(false),       // 현실 왜곡 모드
  status: text("status").notNull().default("active"),          // active | paused | closed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGameServerSchema = createInsertSchema(gameServersTable).omit({
  id: true,
  currentPlayers: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGameServer = z.infer<typeof insertGameServerSchema>;
export type GameServer = typeof gameServersTable.$inferSelect;
