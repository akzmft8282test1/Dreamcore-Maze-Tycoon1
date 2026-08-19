// 서버 로비 페이지
import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListServers, useCreateServer,
  getListServersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import NavBar from "@/components/NavBar";
import { Users, Plus, LogIn, Play } from "lucide-react";

const createServerSchema = z.object({
  name: z.string().min(1, "서버 이름을 입력해주세요").max(30),
  mode: z.string(),
  maxPlayers: z.coerce.number().min(2).max(32),
  isPublic: z.boolean(),
});

type CreateServerForm = z.infer<typeof createServerSchema>;

const MODE_LABELS: Record<string, string> = {
  explore: "탐험",
  liminal: "리미널",
  party: "파티",
  team: "팀",
  backroom: "백룸",
};

export default function LobbyPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { joinServer } = useSocket();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: servers = [], isLoading } = useListServers({
    query: { queryKey: getListServersQueryKey() }
  });

  const createServer = useCreateServer();

  const form = useForm<CreateServerForm>({
    resolver: zodResolver(createServerSchema),
    defaultValues: { name: "", mode: "explore", maxPlayers: 8, isPublic: true },
  });

  const onCreateServer = async (data: CreateServerForm) => {
    try {
      const server = await createServer.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: getListServersQueryKey() });
      setDialogOpen(false);
      toast({ title: "서버가 생성되었습니다" });
      joinServer((server as any).id);
      setLocation("/game");
    } catch (err: any) {
      toast({ title: "서버 생성 실패", description: err.response?.data?.error, variant: "destructive" });
    }
  };

  const handleJoin = (serverId: number) => {
    joinServer(serverId);
    setLocation("/game");
  };

  const handleSolo = () => {
    setLocation("/game");
  };

  return (
    <div className="min-h-screen dreamcore-bg">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-foreground">서버 목록</h1>
            <p className="text-muted-foreground text-sm mt-1">탐험할 미로를 선택하세요</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSolo}
              variant="outline"
              data-testid="button-solo-play"
              className="glass border-border/40"
            >
              <Play className="w-4 h-4 mr-2" />
              솔로 탐험
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-server" className="glow-purple">
                  <Plus className="w-4 h-4 mr-2" />
                  서버 생성
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-strong border-border/40 max-w-md">
                <DialogHeader>
                  <DialogTitle>새 서버 만들기</DialogTitle>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onCreateServer)} className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label>서버 이름</Label>
                    <Input placeholder="이름 없는 복도" {...form.register("name")} />
                  </div>
                  <div className="space-y-2">
                    <Label>게임 모드</Label>
                    <Select
                      defaultValue="explore"
                      onValueChange={v => form.setValue("mode", v)}
                    >
                      <SelectTrigger data-testid="select-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(MODE_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>최대 인원</Label>
                    <Input type="number" min={2} max={32} {...form.register("maxPlayers")} />
                  </div>
                  <Button type="submit" className="w-full" disabled={createServer.isPending}>
                    {createServer.isPending ? "생성 중..." : "서버 열기"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        {/* 서버 목록 */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass rounded-xl h-28 animate-pulse" />
            ))}
          </div>
        ) : servers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24"
          >
            <p className="text-muted-foreground">활성화된 서버가 없습니다</p>
            <p className="text-sm text-muted-foreground/50 mt-1">새 서버를 만들어보세요</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {servers.map((server: any, i: number) => (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-xl p-5 flex flex-col gap-3"
                data-testid={`card-server-${server.id}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{server.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {server.ownerNickname}의 서버
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {MODE_LABELS[server.mode] || server.mode}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {server.currentPlayers}/{server.maxPlayers}명
                  </span>
                  <span>복잡도 {server.complexity}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleJoin(server.id)}
                  data-testid={`button-join-${server.id}`}
                  disabled={server.currentPlayers >= server.maxPlayers}
                  className="self-end"
                >
                  <LogIn className="w-3.5 h-3.5 mr-1.5" />
                  입장
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
