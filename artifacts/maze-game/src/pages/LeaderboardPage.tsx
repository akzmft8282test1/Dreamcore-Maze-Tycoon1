// 명예의 전당 페이지
import { motion } from "framer-motion";
import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import NavBar from "@/components/NavBar";
import { Trophy, Clock, Star } from "lucide-react";

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { data: leaderboard = [], isLoading } = useGetLeaderboard({
    query: { queryKey: getGetLeaderboardQueryKey() }
  });

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  };

  const RANK_BADGES: Record<number, string> = {
    1: "text-yellow-400",
    2: "text-gray-300",
    3: "text-amber-600",
  };

  return (
    <div className="min-h-screen dreamcore-bg">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            <h1 className="text-2xl font-bold">명예의 전당</h1>
          </div>
          <p className="text-muted-foreground text-sm">드림코어의 전설들</p>
        </motion.div>

        {/* 상위 3명 포디엄 */}
        {!isLoading && (leaderboard as any[]).length >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-end justify-center gap-4 mb-10"
          >
            {/* 2위 */}
            <div className="text-center">
              <div className="glass rounded-xl px-6 py-4 h-24 flex flex-col justify-end">
                <p className="font-bold text-gray-300">2위</p>
                <p className="text-sm">{(leaderboard as any[])[1]?.nickname}</p>
              </div>
            </div>
            {/* 1위 */}
            <div className="text-center">
              <div className="glass glow-purple rounded-xl px-8 py-4 h-32 flex flex-col justify-end border-primary/30">
                <Trophy className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                <p className="font-bold text-yellow-400">1위</p>
                <p className="text-sm font-semibold">{(leaderboard as any[])[0]?.nickname}</p>
              </div>
            </div>
            {/* 3위 */}
            <div className="text-center">
              <div className="glass rounded-xl px-6 py-4 h-20 flex flex-col justify-end">
                <p className="font-bold text-amber-600">3위</p>
                <p className="text-sm">{(leaderboard as any[])[2]?.nickname}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* 전체 목록 */}
        <div className="space-y-2">
          {isLoading ? (
            [...Array(10)].map((_, i) => (
              <div key={i} className="glass rounded-xl h-14 animate-pulse" />
            ))
          ) : (leaderboard as any[]).map((entry: any, i: number) => {
            const isMe = entry.userId === user?.id;
            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`glass rounded-xl px-5 py-3 flex items-center gap-4 ${isMe ? "border-primary/30 glow-purple" : ""}`}
                data-testid={`row-leaderboard-${entry.userId}`}
              >
                <span className={`w-8 text-center font-bold text-lg ${RANK_BADGES[entry.rank] || "text-muted-foreground"}`}>
                  {entry.rank}
                </span>
                <div
                  className="w-8 h-8 rounded-full flex-shrink-0"
                  style={{ background: "#8b5cf6", boxShadow: "0 0 10px #8b5cf640" }}
                />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${isMe ? "text-primary" : ""}`}>
                    {entry.nickname} {isMe && <span className="text-xs text-muted-foreground">(나)</span>}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-yellow-400" />
                    {(entry.totalScore || 0).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 hidden sm:flex">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(entry.playtime || 0)}
                  </span>
                </div>
              </motion.div>
            );
          })}
          {!isLoading && (leaderboard as any[]).length === 0 && (
            <div className="text-center py-16 text-muted-foreground">아직 기록이 없습니다</div>
          )}
        </div>
      </div>
    </div>
  );
}
