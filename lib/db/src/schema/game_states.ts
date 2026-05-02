// 게임 상태 테이블 스키마
import {
  pgTable,
  serial,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const gameStatesTable = pgTable("game_states", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  level: integer("level").notNull().default(1),
  currency: integer("currency").notNull().default(0),
  upgrades: jsonb("upgrades").notNull().default({}),  // { upgradeId: level }
  position: jsonb("position").notNull().default({}),  // { x, y, z, mapId }
  stats: jsonb("stats").notNull().default({}),        // { kills, deaths, distance, etc. }
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGameStateSchema = createInsertSchema(gameStatesTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertGameState = z.infer<typeof insertGameStateSchema>;
export type GameState = typeof gameStatesTable.$inferSelect;
