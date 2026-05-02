// 관리자 콘솔: 상하상좌상우상 시퀀스로 진입, macOS 스타일 인터페이스
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminStats, useListUsers, useUpdateUser, useBanUser, useDeleteUser,
  useGetWorldSettings, useUpdateWorldSettings, useSendAnnouncement,
  useGetAdminLogs, useGetAnomalies, useListReports, useUpdateReport,
  useListServers, useDeleteServer,
  getGetAdminStatsQueryKey, getListUsersQueryKey, getGetWorldSettingsQueryKey,
  getGetAdminLogsQueryKey, getGetAnomaliesQueryKey, getListReportsQueryKey,
  getListServersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NavBar from "@/components/NavBar";
import { Users, Globe, Server, Terminal, FileText, AlertTriangle, BarChart3 } from "lucide-react";

// 진입 시퀀스: 상하상좌상우상
const ADMIN_SEQUENCE = ["ArrowUp", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowUp"];

// ── 터미널 컴포넌트 ──────────────────────────────
interface TerminalLine { type: "input" | "output" | "error"; text: string }

function AdminTerminal() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "output", text: "드림코어 관리자 터미널 v1.0" },
    { type: "output", text: "help 를 입력하여 명령어 목록을 확인하세요." },
    { type: "output", text: "─".repeat(40) },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const COMMANDS = [
    "help", "clear",
    "users list", "users ban", "users kick",
    "servers list", "servers close",
    "world set complexity", "world set traprate", "world blackout",
    "announce", "spawn entity",
    "report list", "log tail",
  ];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" });
  }, [lines]);

  const print = (text: string, type: TerminalLine["type"] = "output") => {
    setLines(prev => [...prev, { type, text }]);
  };

  const execute = async (cmd: string) => {
    const parts = cmd.trim().split(/\s+/);
    const base = parts.slice(0, 2).join(" ").toLowerCase();

    if (cmd.toLowerCase() === "help") {
      print("사용 가능한 명령어:");
      COMMANDS.forEach(c => print(`  ${c}`));
    } else if (cmd.toLowerCase() === "clear") {
      setLines([]);
    } else if (base === "users list") {
      try {
        const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
        const users = await res.json();
        users.forEach((u: any) => print(`  [${u.id}] ${u.nickname} (${u.username}) - ${u.role} - 재화:${u.currency}`));
      } catch { print("오류: 유저 목록을 불러올 수 없습니다", "error"); }
    } else if (base === "servers list") {
      queryClient.fetchQuery({ queryKey: getListServersQueryKey(), queryFn: async () => {
        const res = await fetch("/api/servers", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
        const servers = await res.json();
        servers.forEach((s: any) => print(`  [${s.id}] ${s.name} - ${s.currentPlayers}/${s.maxPlayers}명`));
        return servers;
      }}).catch(() => print("오류", "error"));
    } else if (base === "world blackout") {
      print("블랙아웃 전송 중...");
      toast({ title: "블랙아웃 이벤트 발생" });
    } else if (parts[0].toLowerCase() === "announce") {
      const msg = parts.slice(1).join(" ");
      if (!msg) { print("사용법: announce [메시지]", "error"); return; }
      try {
        await fetch("/api/admin/announce", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: JSON.stringify({ message: msg }),
        });
        print(`공지 전송 완료: ${msg}`);
      } catch { print("오류", "error"); }
    } else if (base === "report list") {
      try {
        const res = await fetch("/api/reports", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
        const reports = await res.json();
        reports.slice(0, 10).forEach((r: any) => print(`  [${r.id}] ${r.reporterNickname} → ${r.targetNickname}: ${r.reason} [${r.status}]`));
      } catch { print("오류", "error"); }
    } else if (base === "log tail") {
      try {
        const res = await fetch("/api/admin/logs?limit=10", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
        const logs = await res.json();
        logs.forEach((l: any) => print(`  [${l.type}] ${l.message}`));
      } catch { print("오류", "error"); }
    } else {
      print(`알 수 없는 명령어: ${cmd}. help 를 입력해보세요.`, "error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      print(`> ${input}`, "input");
      setHistory(prev => [input, ...prev.slice(0, 49)]);
      setHistIdx(-1);
      execute(input);
      setInput("");
      setSuggestions([]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const matches = COMMANDS.filter(c => c.startsWith(input.toLowerCase()));
      if (matches.length === 1) { setInput(matches[0]); setSuggestions([]); }
      else if (matches.length > 1) { setSuggestions(matches); }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(idx);
      if (history[idx]) setInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setInput(idx === -1 ? "" : history[idx] || "");
    }
  };

  return (
    <div
      className="bg-black rounded-xl overflow-hidden font-mono text-xs h-96 flex flex-col border border-primary/20"
      onClick={() => inputRef.current?.focus()}
      data-testid="admin-terminal"
    >
      {/* 맥 스타일 타이틀바 */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-2 text-zinc-400 text-xs">드림코어 터미널</span>
      </div>
      {/* 출력 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {lines.map((line, i) => (
          <div key={i} className={
            line.type === "input" ? "text-cyan-400" :
            line.type === "error" ? "text-red-400" :
            "text-green-300"
          }>
            {line.text}
          </div>
        ))}
        {suggestions.length > 0 && (
          <div className="text-yellow-400">{suggestions.join("  ")}</div>
        )}
      </div>
      {/* 입력 */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-zinc-800">
        <span className="text-cyan-400">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-green-300 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
          data-testid="terminal-input"
        />
      </div>
    </div>
  );
}

// ── 메인 관리자 페이지 ──────────────────────────
export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [unlocked, setUnlocked] = useState(false);
  const [seqProgress, setSeqProgress] = useState(0);
  const [failFlash, setFailFlash] = useState(false);
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 진입 시퀀스 감지
  useEffect(() => {
    if (!isAdmin) return;
    const handler = (e: KeyboardEvent) => {
      const expected = ADMIN_SEQUENCE[seqProgress];
      if (e.key === expected) {
        const next = seqProgress + 1;
        if (next === ADMIN_SEQUENCE.length) {
          setUnlocked(true);
          setSeqProgress(0);
        } else {
          setSeqProgress(next);
        }
      } else if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
        setSeqProgress(0);
        setFailFlash(true);
        setTimeout(() => setFailFlash(false), 400);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [seqProgress, isAdmin]);

  // 데이터 훅
  const { data: stats } = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey(), enabled: unlocked } });
  const { data: users = [] } = useListUsers({ query: { queryKey: getListUsersQueryKey(), enabled: unlocked } });
  const { data: worldSettings } = useGetWorldSettings({ query: { queryKey: getGetWorldSettingsQueryKey(), enabled: unlocked } });
  const { data: logs = [] } = useGetAdminLogs({}, { query: { queryKey: getGetAdminLogsQueryKey(), enabled: unlocked } });
  const { data: anomalies = [] } = useGetAnomalies({ query: { queryKey: getGetAnomaliesQueryKey(), enabled: unlocked } });
  const { data: reports = [] } = useListReports({ query: { queryKey: getListReportsQueryKey(), enabled: unlocked } });
  const { data: servers = [] } = useListServers({ query: { queryKey: getListServersQueryKey(), enabled: unlocked } });

  const banUser = useBanUser();
  const deleteUser = useDeleteUser();
  const updateWorld = useUpdateWorldSettings();
  const sendAnnouncement = useSendAnnouncement();
  const updateReport = useUpdateReport();
  const deleteServer = useDeleteServer();

  const [announceText, setAnnounceText] = useState("");
  const [worldVals, setWorldVals] = useState({
    complexity: 5, trapRate: 0.1, ambientDarkness: 0.7, mapWarp: false,
    wallThickness: 1.0, entitySpawnRate: 0.05, glitchFrequency: 0.1,
  });

  useEffect(() => {
    if (worldSettings) {
      setWorldVals(prev => ({
        ...prev,
        complexity: (worldSettings as any).complexity ?? 5,
        trapRate: (worldSettings as any).trapRate ?? 0.1,
        ambientDarkness: (worldSettings as any).ambientDarkness ?? 0.7,
        mapWarp: (worldSettings as any).mapWarp ?? false,
        wallThickness: (worldSettings as any).wallThickness ?? 1.0,
        entitySpawnRate: (worldSettings as any).entitySpawnRate ?? 0.05,
        glitchFrequency: (worldSettings as any).glitchFrequency ?? 0.1,
      }));
    }
  }, [worldSettings]);

  const handleBan = async (userId: number, banned: boolean) => {
    await banUser.mutateAsync({ id: userId, data: { banned } });
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    toast({ title: banned ? "채팅 금지 처리됨" : "채팅 금지 해제됨" });
  };

  const handleDeleteUser = async (userId: number) => {
    await deleteUser.mutateAsync({ id: userId });
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    toast({ title: "유저 삭제됨" });
  };

  const handleWorldSave = async () => {
    await updateWorld.mutateAsync({ data: worldVals });
    queryClient.invalidateQueries({ queryKey: getGetWorldSettingsQueryKey() });
    toast({ title: "월드 설정 저장됨" });
  };

  const handleAnnounce = async () => {
    if (!announceText.trim()) return;
    await sendAnnouncement.mutateAsync({ data: { message: announceText } });
    setAnnounceText("");
    toast({ title: "공지 전송됨" });
  };

  const handleReportStatus = async (reportId: number, status: string) => {
    await updateReport.mutateAsync({ reportId, data: { status } });
    queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
  };

  // 잠금 화면
  if (!unlocked) {
    return (
      <div className={`min-h-screen dreamcore-bg flex items-center justify-center ${failFlash ? "bg-red-900/10" : ""}`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="glass rounded-2xl p-10 max-w-sm mx-auto">
            <h2 className="text-xl font-bold mb-2">관리자 접근</h2>
            <p className="text-muted-foreground text-sm mb-6">키보드 시퀀스를 입력하세요</p>
            <div className="flex justify-center gap-2 mb-6">
              {ADMIN_SEQUENCE.map((key, i) => {
                const symbols: Record<string, string> = {
                  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→"
                };
                return (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded flex items-center justify-center text-sm border transition-colors ${
                      i < seqProgress
                        ? "bg-primary/30 border-primary/50 text-primary"
                        : i === seqProgress
                        ? "border-primary/30 text-primary animate-pulse"
                        : "border-border/30 text-muted-foreground"
                    }`}
                  >
                    {symbols[key]}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              진행: {seqProgress}/{ADMIN_SEQUENCE.length}
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen dreamcore-bg">
      <NavBar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-2xl font-bold text-red-400">관리자 콘솔</h1>
          <p className="text-muted-foreground text-sm">{user?.nickname} ({user?.role})</p>
        </motion.div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-6 bg-muted/50 flex-wrap h-auto gap-1">
            <TabsTrigger value="dashboard" data-testid="admin-tab-dashboard">
              <BarChart3 className="w-3.5 h-3.5 mr-1" />대시보드
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="admin-tab-users">
              <Users className="w-3.5 h-3.5 mr-1" />유저 관리
            </TabsTrigger>
            <TabsTrigger value="world" data-testid="admin-tab-world">
              <Globe className="w-3.5 h-3.5 mr-1" />월드 제어
            </TabsTrigger>
            <TabsTrigger value="servers" data-testid="admin-tab-servers">
              <Server className="w-3.5 h-3.5 mr-1" />서버 제어
            </TabsTrigger>
            <TabsTrigger value="terminal" data-testid="admin-tab-terminal">
              <Terminal className="w-3.5 h-3.5 mr-1" />터미널
            </TabsTrigger>
            <TabsTrigger value="logs" data-testid="admin-tab-logs">
              <FileText className="w-3.5 h-3.5 mr-1" />로그
            </TabsTrigger>
            <TabsTrigger value="reports" data-testid="admin-tab-reports">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" />신고
            </TabsTrigger>
          </TabsList>

          {/* 대시보드 */}
          <TabsContent value="dashboard">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "총 유저", value: (stats as any)?.totalUsers ?? "-" },
                { label: "접속 중", value: (stats as any)?.onlineUsers ?? "-" },
                { label: "활성 서버", value: (stats as any)?.activeServers ?? "-" },
                { label: "미처리 신고", value: (stats as any)?.pendingReports ?? "-" },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass rounded-xl p-4 text-center"
                >
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                </motion.div>
              ))}
            </div>
            {/* 공지 전송 */}
            <div className="glass rounded-xl p-5">
              <h3 className="font-semibold mb-3">전체 공지 전송</h3>
              <div className="flex gap-2">
                <Input
                  value={announceText}
                  onChange={e => setAnnounceText(e.target.value)}
                  placeholder="공지 메시지..."
                  data-testid="input-announcement"
                  onKeyDown={e => e.key === "Enter" && handleAnnounce()}
                />
                <Button onClick={handleAnnounce} disabled={sendAnnouncement.isPending} data-testid="button-send-announcement">
                  전송
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* 유저 관리 */}
          <TabsContent value="users">
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground">
                    <th className="text-left px-4 py-3">ID</th>
                    <th className="text-left px-4 py-3">아이디</th>
                    <th className="text-left px-4 py-3">닉네임</th>
                    <th className="text-left px-4 py-3">비밀번호</th>
                    <th className="text-left px-4 py-3">역할</th>
                    <th className="text-left px-4 py-3">재화</th>
                    <th className="text-left px-4 py-3">상태</th>
                    <th className="text-right px-4 py-3">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {(users as any[]).map((u: any) => (
                    <tr key={u.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors" data-testid={`row-user-${u.id}`}>
                      <td className="px-4 py-3 text-muted-foreground">{u.id}</td>
                      <td className="px-4 py-3">{u.username}</td>
                      <td className="px-4 py-3 font-medium">{u.nickname}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">{u.password?.slice(0, 20)}...</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={u.role === "master" ? "text-red-400 border-red-400/30" : u.role === "admin" ? "text-orange-400 border-orange-400/30" : ""}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-yellow-400">{(u.currency || 0).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {u.isBanned ? <Badge variant="destructive" className="text-xs">금지됨</Badge> : <span className="text-xs text-green-400">정상</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => handleBan(u.id, !u.isBanned)}
                            data-testid={`button-ban-${u.id}`}>
                            {u.isBanned ? "해제" : "금지"}
                          </Button>
                          {user?.role === "master" && u.role !== "master" && (
                            <Button size="sm" variant="destructive" className="h-7 text-xs"
                              onClick={() => handleDeleteUser(u.id)}
                              data-testid={`button-delete-user-${u.id}`}>
                              삭제
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* 월드 제어 */}
          <TabsContent value="world">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass rounded-xl p-6 space-y-5">
                <h3 className="font-semibold">미로 설정</h3>
                <div className="space-y-2">
                  <Label className="text-sm">복잡도: {worldVals.complexity}</Label>
                  <Slider value={[worldVals.complexity]} onValueChange={([v]) => setWorldVals(prev => ({ ...prev, complexity: v }))} min={1} max={10} step={1} data-testid="slider-complexity" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">함정 비율: {worldVals.trapRate.toFixed(2)}</Label>
                  <Slider value={[worldVals.trapRate * 100]} onValueChange={([v]) => setWorldVals(prev => ({ ...prev, trapRate: v / 100 }))} min={0} max={100} step={1} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">어둠 정도: {worldVals.ambientDarkness.toFixed(2)}</Label>
                  <Slider value={[worldVals.ambientDarkness * 100]} onValueChange={([v]) => setWorldVals(prev => ({ ...prev, ambientDarkness: v / 100 }))} min={0} max={100} step={1} />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={worldVals.mapWarp} onCheckedChange={v => setWorldVals(prev => ({ ...prev, mapWarp: v }))} data-testid="switch-mapwarp" />
                  <Label>맵 워프 활성화</Label>
                </div>
                <Button onClick={handleWorldSave} className="w-full" disabled={updateWorld.isPending} data-testid="button-save-world">
                  설정 저장
                </Button>
              </div>

              <div className="glass rounded-xl p-6 space-y-4">
                <h3 className="font-semibold">이벤트 제어</h3>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full text-left justify-start" data-testid="button-blackout"
                    onClick={() => toast({ title: "블랙아웃 이벤트 발생" })}>
                    전체 서버 블랙아웃
                  </Button>
                  <Button variant="outline" className="w-full text-left justify-start" data-testid="button-spawn-peeker"
                    onClick={() => toast({ title: "Peeker 소환됨" })}>
                    Peeker 소환
                  </Button>
                  <Button variant="outline" className="w-full text-left justify-start" data-testid="button-spawn-stalker"
                    onClick={() => toast({ title: "Stalker 소환됨" })}>
                    Stalker 소환
                  </Button>
                  <Button variant="outline" className="w-full text-left justify-start text-orange-400 border-orange-400/30" data-testid="button-glitch-all"
                    onClick={() => toast({ title: "전체 글리치 발생" })}>
                    전체 글리치 이벤트
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 서버 제어 */}
          <TabsContent value="servers">
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground">
                    <th className="text-left px-4 py-3">ID</th>
                    <th className="text-left px-4 py-3">이름</th>
                    <th className="text-left px-4 py-3">모드</th>
                    <th className="text-left px-4 py-3">인원</th>
                    <th className="text-left px-4 py-3">상태</th>
                    <th className="text-right px-4 py-3">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {(servers as any[]).map((s: any) => (
                    <tr key={s.id} className="border-b border-border/20 hover:bg-muted/20" data-testid={`row-server-${s.id}`}>
                      <td className="px-4 py-3 text-muted-foreground">{s.id}</td>
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{s.mode}</Badge></td>
                      <td className="px-4 py-3">{s.currentPlayers}/{s.maxPlayers}</td>
                      <td className="px-4 py-3"><span className="text-xs text-green-400">{s.status}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="destructive" className="h-7 text-xs"
                            onClick={async () => { await deleteServer.mutateAsync({ serverId: s.id }); queryClient.invalidateQueries({ queryKey: getListServersQueryKey() }); }}
                            data-testid={`button-close-server-${s.id}`}>
                            닫기
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(servers as any[]).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">서버 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* 터미널 */}
          <TabsContent value="terminal">
            <AdminTerminal />
          </TabsContent>

          {/* 로그 */}
          <TabsContent value="logs">
            <div className="glass rounded-xl p-4 h-96 overflow-y-auto font-mono text-xs space-y-1" data-testid="admin-logs">
              {(logs as any[]).map((log: any, i: number) => (
                <div key={i} className="flex gap-3 text-muted-foreground hover:text-foreground transition-colors">
                  <span className="text-muted-foreground/50 shrink-0">{new Date(log.createdAt).toLocaleTimeString("ko-KR")}</span>
                  <span className={`shrink-0 ${log.type === "admin" ? "text-red-400" : log.type === "error" ? "text-orange-400" : "text-cyan-400"}`}>[{log.type}]</span>
                  <span className="truncate">{log.message}</span>
                </div>
              ))}
              {(logs as any[]).length === 0 && (
                <p className="text-muted-foreground text-center py-8">로그 없음</p>
              )}
            </div>
          </TabsContent>

          {/* 신고 */}
          <TabsContent value="reports">
            <div className="space-y-3">
              {(reports as any[]).map((r: any, i: number) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="glass rounded-xl px-5 py-4 flex items-center gap-4"
                  data-testid={`row-report-${r.id}`}
                >
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="text-primary">{r.reporterNickname}</span>
                      <span className="text-muted-foreground mx-2">→</span>
                      <span className="text-red-400">{r.targetNickname}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                  </div>
                  <Badge variant={r.status === "pending" ? "destructive" : "outline"} className="text-xs">
                    {r.status === "pending" ? "미처리" : r.status === "resolved" ? "처리됨" : "기각됨"}
                  </Badge>
                  {r.status === "pending" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleReportStatus(r.id, "resolved")}>처리</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleReportStatus(r.id, "dismissed")}>기각</Button>
                    </div>
                  )}
                </motion.div>
              ))}
              {(reports as any[]).length === 0 && (
                <div className="text-center py-16 text-muted-foreground">신고 내역 없음</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
