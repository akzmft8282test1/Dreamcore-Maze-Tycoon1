// DB 스냅샷 테이블 스키마 (게임 상태 롤백용)
import {
  pgTable,
  serial,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const snapshotsTable = pgTable("snapshots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),   // 당시 game_state 전체 복사본
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
