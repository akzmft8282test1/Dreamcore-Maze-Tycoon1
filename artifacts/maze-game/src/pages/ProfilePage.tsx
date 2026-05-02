// 프로필 페이지: 인벤토리, 스냅샷, 통계
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe, useGetGameState, useGetUserInventory,
  useListSnapshots, useCreateSnapshot, useRollbackSnapshot,
  useCreateReport,
  getGetMeQueryKey, getGetGameStateQueryKey,
  getGetUserInventoryQueryKey, getListSnapshotsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NavBar from "@/components/NavBar";
import { Save, RotateCcw, Clock, Star } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: gameState } = useGetGameState({ query: { queryKey: getGetGameStateQueryKey() } });
  const { data: inventory = [] } = useGetUserInventory(user?.id ?? 0, {
    query: { queryKey: getGetUserInventoryQueryKey(user?.id ?? 0), enabled: !!user }
  });
  const { data: snapshots = [] } = useListSnapshots({ query: { queryKey: getListSnapshotsQueryKey() } });

  const createSnapshot = useCreateSnapshot();
  const rollbackSnapshot = useRollbackSnapshot();

  const handleSave = async () => {
    try {
      await createSnapshot.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getListSnapshotsQueryKey() });
      toast({ title: "스냅샷이 저장되었습니다" });
    } catch {
      toast({ title: "저장 실패", variant: "destructive" });
    }
  };

  const handleRollback = async (snapshotId: number) => {
    try {
      await rollbackSnapshot.mutateAsync({ snapshotId });
      queryClient.invalidateQueries({ queryKey: getGetGameStateQueryKey() });
      toast({ title: "복구되었습니다" });
    } catch {
      toast({ title: "복구 실패", variant: "destructive" });
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("ko-KR", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });

  return (
    <div className="min-h-screen dreamcore-bg">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 프로필 헤더 */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/30 flex items-center justify-center glow-purple">
              <span className="text-2xl font-bold text-primary">{me?.nickname?.[0] || "?"}</span>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{me?.nickname}</h2>
              <p className="text-sm text-muted-foreground">@{me?.username}</p>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-yellow-400" />
                  {(me?.totalScore || 0).toLocaleString()} 점
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {Math.floor((me?.playtime || 0) / 60)}분 플레이
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">보유 재화</p>
              <p className="text-xl font-bold text-yellow-400">{(me?.currency || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">레벨 {gameState?.level ?? 1}</p>
            </div>
          </div>
        </motion.div>

        <Tabs defaultValue="stats">
          <TabsList className="mb-6 bg-muted/50">
            <TabsTrigger value="stats">통계</TabsTrigger>
            <TabsTrigger value="inventory">인벤토리</TabsTrigger>
            <TabsTrigger value="snapshots">스냅샷</TabsTrigger>
          </TabsList>

          {/* 통계 탭 */}
          <TabsContent value="stats">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "총 점수", value: (me?.totalScore || 0).toLocaleString() },
                { label: "레벨", value: gameState?.level ?? 1 },
                { label: "보유 재화", value: (me?.currency || 0).toLocaleString() },
                { label: "플레이 시간", value: `${Math.floor((me?.playtime || 0) / 60)}분` },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass rounded-xl p-4 text-center"
                >
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold mt-1">{stat.value}</p>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* 인벤토리 탭 */}
          <TabsContent value="inventory">
            {(inventory as any[]).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">인벤토리가 비어 있습니다</div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {(inventory as any[]).map((item: any, i: number) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="glass rounded-xl p-3 flex flex-col items-center gap-2 text-center"
                    data-testid={`inv-item-${item.itemId}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/30" />
                    <p className="text-xs text-muted-foreground truncate w-full">{item.itemId}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 스냅샷 탭 */}
          <TabsContent value="snapshots">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={createSnapshot.isPending} size="sm" data-testid="button-save-snapshot">
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  현재 상태 저장
                </Button>
              </div>
              {(snapshots as any[]).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">저장된 스냅샷이 없습니다</div>
              ) : (
                (snapshots as any[]).map((snap: any, i: number) => (
                  <motion.div
                    key={snap.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass rounded-xl px-5 py-4 flex items-center justify-between"
                    data-testid={`snapshot-${snap.id}`}
                  >
                    <div>
                      <p className="text-sm font-medium">스냅샷 #{snap.id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(snap.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        레벨 {(snap.data as any)?.level} · 재화 {((snap.data as any)?.currency || 0).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRollback(snap.id)}
                      disabled={rollbackSnapshot.isPending}
                      data-testid={`button-rollback-${snap.id}`}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      복구
                    </Button>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
