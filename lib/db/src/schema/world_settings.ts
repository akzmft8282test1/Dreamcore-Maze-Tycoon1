// 월드 전역 설정 테이블 스키마
import {
  pgTable,
  serial,
  integer,
  real,
  boolean,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const worldSettingsTable = pgTable("world_settings", {
  id: serial("id").primaryKey(),
  complexity: integer("complexity").notNull().default(5),
  wallThickness: real("wall_thickness").notNull().default(1.0),
  trapRate: real("trap_rate").notNull().default(0.1),
  mapWarp: boolean("map_warp").notNull().default(false),
  entitySpawnRate: real("entity_spawn_rate").notNull().default(0.05),
  ambientDarkness: real("ambient_darkness").notNull().default(0.7),
  glitchFrequency: real("glitch_frequency").notNull().default(0.1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
