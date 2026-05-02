// 관리자 콘솔 — 전지전능 버전 (↑↓↑←↑→↑ 시퀀스)
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminStats, useListUsers, useUpdateUser, useBanUser, useDeleteUser,
  useGetWorldSettings, useUpdateWorldSettings, useSendAnnouncement,
  useGetAdminLogs, useGetAnomalies, useListReports, useUpdateReport,
  useListServers, useDeleteServer,
  useAdminSetCurrency, useAdminSetRole, useAdminGiveItem,
  useAdminResetGamestate, useAdminGiveAll, useAdminBroadcastEvent,
  useAdminClearInventory, useAdminResetPassword, useGetAdminEconomy,
  getGetAdminStatsQueryKey, getListUsersQueryKey, getGetWorldSettingsQueryKey,
  getGetAdminLogsQueryKey, getGetAnomaliesQueryKey, getListReportsQueryKey,
  getListServersQueryKey, getGetAdminEconomyQueryKey,
} from "@workspace/api-client-react";
import { SHOP_ITEMS } from "@/lib/shopItems";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import NavBar from "@/components/NavBar";
import {
  Users, Globe, Server, Terminal, FileText, AlertTriangle,
  BarChart3, DollarSign, Gift, Shield, Trash2, RefreshCw,
  Zap, Megaphone, Eye,
} from "lucide-react";

const ADMIN_SEQUENCE = ["ArrowUp", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowUp"];

// ── 터미널 ─────────────────────────────────────────
interface TerminalLine { type: "input" | "output" | "error" | "success"; text: string }

function AdminTerminal() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "output", text: "드림코어 관리자 터미널 v2.0 — 전지전능 모드" },
    { type: "output", text: "help 를 입력하여 명령어 목록을 확인하세요." },
    { type: "output", text: "─".repeat(48) },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const COMMANDS = [
    "help", "clear",
    "users list", "users ban <id>", "users unban <id>", "users delete <id>",
    "users give-currency <id> <amount>", "users add-currency <id> <amount>",
    "users give-item <id> <itemId>", "users set-role <id> <role>",
    "users reset-gamestate <id>", "users clear-inventory <id>",
    "users reset-password <id> <newpw>", "users info <id>",
    "economy stats", "economy give-all <amount>",
    "servers list", "servers close <id>",
    "world set complexity <1-10>", "world set traprate <0-1>",
    "world blackout", "world entity-surge", "world map-warp",
    "world glitch-storm", "world currency-rain",
    "announce <메시지>", "report list", "log tail", "log tail <n>",
  ];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [lines]);

  const print = (text: string, type: TerminalLine["type"] = "output") =>
    setLines(prev => [...prev, { type, text }]);

  const api = (path: string, method = "GET", body?: object) => fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const execute = useCallback(async (cmd: string) => {
    const parts = cmd.trim().split(/\s+/);
    const p = (i: number) => parts[i] || "";
    const rest = (from: number) => parts.slice(from).join(" ");

    if (cmd.toLowerCase() === "help") {
      print("사용 가능한 명령어:");
      COMMANDS.forEach(c => print(`  ${c}`));
      return;
    }
    if (cmd.toLowerCase() === "clear") { setLines([]); return; }

    // users list
    if (p(0) === "users" && p(1) === "list") {
      try {
        const r = await api("/api/users");
        const users = await r.json();
        users.forEach((u: any) => print(`  [${u.id}] ${u.nickname} (${u.username}) | ${u.role} | DC:${u.currency} | ${u.isBanned ? "금지됨" : "정상"}`));
      } catch { print("오류: 유저 목록 조회 실패", "error"); }
      return;
    }
    // users ban/unban
    if (p(0) === "users" && (p(1) === "ban" || p(1) === "unban")) {
      const id = parseInt(p(2));
      const banned = p(1) === "ban";
      if (!id) { print("사용법: users ban <id>", "error"); return; }
      try {
        await api(`/api/users/${id}/ban`, "POST", { banned });
        print(`유저 ${id} ${banned ? "채팅 금지" : "금지 해제"} 완료`, "success");
      } catch { print("오류", "error"); }
      return;
    }
    // users delete
    if (p(0) === "users" && p(1) === "delete") {
      const id = parseInt(p(2));
      if (!id) { print("사용법: users delete <id>", "error"); return; }
      try {
        await api(`/api/users/${id}`, "DELETE");
        print(`유저 ${id} 삭제 완료`, "success");
      } catch { print("오류", "error"); }
      return;
    }
    // users give-currency / add-currency
    if (p(0) === "users" && (p(1) === "give-currency" || p(1) === "add-currency")) {
      const id = parseInt(p(2)), amount = parseInt(p(3));
      if (!id || isNaN(amount)) { print("사용법: users give-currency <id> <amount>", "error"); return; }
      const mode = p(1) === "add-currency" ? "add" : "set";
      try {
        const r = await api(`/api/admin/users/${id}/set-currency`, "POST", { amount, mode });
        const data = await r.json();
        print(`유저 ${data.nickname} 재화 ${mode === "add" ? "+" : "→"}${amount} DC (현재: ${data.currency} DC)`, "success");
      } catch { print("오류", "error"); }
      return;
    }
    // users give-item
    if (p(0) === "users" && p(1) === "give-item") {
      const id = parseInt(p(2)), itemId = p(3);
      if (!id || !itemId) { print("사용법: users give-item <id> <itemId>", "error"); return; }
      try {
        const r = await api(`/api/admin/users/${id}/give-item`, "POST", { itemId });
        const data = await r.json();
        print(data.message || data.error, data.error ? "error" : "success");
      } catch { print("오류", "error"); }
      return;
    }
    // users set-role
    if (p(0) === "users" && p(1) === "set-role") {
      const id = parseInt(p(2)), role = p(3);
      if (!id || !role) { print("사용법: users set-role <id> <user|admin|master>", "error"); return; }
      try {
        const r = await api(`/api/admin/users/${id}/set-role`, "POST", { role });
        const data = await r.json();
        print(data.error ? data.error : `유저 ${data.nickname} 역할 → ${data.role}`, data.error ? "error" : "success");
      } catch { print("오류", "error"); }
      return;
    }
    // users reset-gamestate
    if (p(0) === "users" && p(1) === "reset-gamestate") {
      const id = parseInt(p(2));
      if (!id) { print("사용법: users reset-gamestate <id>", "error"); return; }
      try {
        const r = await api(`/api/admin/users/${id}/reset-gamestate`, "DELETE");
        const data = await r.json();
        print(data.message, "success");
      } catch { print("오류", "error"); }
      return;
    }
    // users clear-inventory
    if (p(0) === "users" && p(1) === "clear-inventory") {
      const id = parseInt(p(2));
      if (!id) { print("사용법: users clear-inventory <id>", "error"); return; }
      try {
        const r = await api(`/api/admin/users/${id}/clear-inventory`, "DELETE");
        const data = await r.json();
        print(data.message, "success");
      } catch { print("오류", "error"); }
      return;
    }
    // users reset-password
    if (p(0) === "users" && p(1) === "reset-password") {
      const id = parseInt(p(2)), pw = p(3);
      if (!id || !pw) { print("사용법: users reset-password <id> <newpw>", "error"); return; }
      try {
        const r = await api(`/api/admin/users/${id}/reset-password`, "POST", { newPassword: pw });
        const data = await r.json();
        print(data.message || data.error, data.error ? "error" : "success");
      } catch { print("오류", "error"); }
      return;
    }
    // users info
    if (p(0) === "users" && p(1) === "info") {
      const id = parseInt(p(2));
      if (!id) { print("사용법: users info <id>", "error"); return; }
      try {
        const r = await api(`/api/users/${id}`);
        const u = await r.json();
        print(`[${u.id}] ${u.nickname} | 아이디: ${u.username} | 역할: ${u.role} | DC: ${u.currency} | 점수: ${u.totalScore}`);
        const gs = await api(`/api/admin/users/${id}/gamestate`);
        const state = await gs.json();
        if (!state.error) print(`  레벨: ${state.level} | 업그레이드: ${JSON.stringify(state.upgrades)}`);
      } catch { print("오류", "error"); }
      return;
    }
    // economy stats
    if (p(0) === "economy" && p(1) === "stats") {
      try {
        const r = await api("/api/admin/economy");
        const data = await r.json();
        print(`총 유통량: ${data.totalCirculating.toLocaleString()} DC`);
        print(`평균 보유: ${data.averageCurrency.toLocaleString()} DC`);
        print(`최고 보유: ${data.maxCurrency.toLocaleString()} DC`);
        print("상위 부자:");
        (data.richest as any[]).slice(0, 5).forEach((u: any) =>
          print(`  ${u.nickname}: ${u.currency.toLocaleString()} DC`));
      } catch { print("오류", "error"); }
      return;
    }
    // economy give-all
    if (p(0) === "economy" && p(1) === "give-all") {
      const amount = parseInt(p(2));
      if (!amount) { print("사용법: economy give-all <amount>", "error"); return; }
      try {
        const r = await api("/api/admin/economy/give-all", "POST", { amount });
        const data = await r.json();
        print(data.message, "success");
      } catch { print("오류", "error"); }
      return;
    }
    // announce
    if (p(0) === "announce") {
      const msg = rest(1);
      if (!msg) { print("사용법: announce <메시지>", "error"); return; }
      try {
        await api("/api/admin/announce", "POST", { message: msg });
        print(`공지 전송 완료: ${msg}`, "success");
        toast({ title: `공지: ${msg}` });
      } catch { print("오류", "error"); }
      return;
    }
    // world events
    if (p(0) === "world") {
      const sub = p(1);
      if (["blackout","entity-surge","map-warp","glitch-storm","currency-rain","portal-open"].includes(sub)) {
        const eventType = sub.replace("-", "_");
        try {
          const r = await api("/api/admin/broadcast-event", "POST", { eventType });
          const data = await r.json();
          print(data.message, "success");
          toast({ title: `이벤트: ${sub}` });
        } catch { print("오류", "error"); }
        return;
      }
      if (sub === "set") {
        const key = p(2), val = parseFloat(p(3));
        if (!key || isNaN(val)) { print("사용법: world set <key> <value>", "error"); return; }
        const keyMap: Record<string, string> = { complexity: "complexity", traprate: "trapRate", darkness: "ambientDarkness", entityrate: "entitySpawnRate" };
        const field = keyMap[key.toLowerCase()] || key;
        try {
          await api("/api/admin/world-settings", "PATCH", { [field]: val });
          print(`월드 설정 ${field} = ${val} 저장됨`, "success");
        } catch { print("오류", "error"); }
        return;
      }
    }
    // servers list
    if (p(0) === "servers" && p(1) === "list") {
      try {
        const r = await api("/api/servers");
        const servers = await r.json();
        servers.forEach((s: any) => print(`  [${s.id}] ${s.name} | ${s.currentPlayers}/${s.maxPlayers}명 | ${s.status}`));
      } catch { print("오류", "error"); }
      return;
    }
    // servers close
    if (p(0) === "servers" && p(1) === "close") {
      const id = parseInt(p(2));
      if (!id) { print("사용법: servers close <id>", "error"); return; }
      try {
        await api(`/api/servers/${id}`, "DELETE");
        print(`서버 ${id} 삭제 완료`, "success");
      } catch { print("오류", "error"); }
      return;
    }
    // report list
    if (p(0) === "report" && p(1) === "list") {
      try {
        const r = await api("/api/reports");
        const reports = await r.json();
        reports.slice(0, 10).forEach((rep: any) =>
          print(`  [${rep.id}] ${rep.reporterNickname} → ${rep.targetNickname}: ${rep.reason} [${rep.status}]`));
      } catch { print("오류", "error"); }
      return;
    }
    // log tail
    if (p(0) === "log" && p(1) === "tail") {
      const limit = parseInt(p(2)) || 10;
      try {
        const r = await api(`/api/admin/logs?limit=${limit}`);
        const logs = await r.json();
        logs.forEach((l: any) => print(`  [${l.type}] ${l.message}`));
      } catch { print("오류", "error"); }
      return;
    }

    print(`알 수 없는 명령어: "${cmd}". help 를 입력해보세요.`, "error");
  }, [toast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      print(`$ ${input}`, "input");
      setHistory(prev => [input, ...prev.slice(0, 49)]);
      setHistIdx(-1);
      execute(input);
      setInput("");
      setSuggestions([]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const matches = COMMANDS.filter(c => c.startsWith(input.toLowerCase()));
      if (matches.length === 1) {
        const firstWord = matches[0].split(" ")[0];
        setInput(firstWord + " ");
        setSuggestions([]);
      } else if (matches.length > 1) {
        setSuggestions(matches.slice(0, 8));
      }
    } else if (e.key === "ArrowUp" && !e.shiftKey) {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(idx);
      if (history[idx]) setInput(history[idx]);
    } else if (e.key === "ArrowDown" && !e.shiftKey) {
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setInput(idx === -1 ? "" : history[idx] || "");
    }
  };

  return (
    <div
      className="bg-black rounded-xl overflow-hidden font-mono text-xs h-[420px] flex flex-col border border-primary/20"
      onClick={() => inputRef.current?.focus()}
      data-testid="admin-terminal"
    >
      <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-2 text-zinc-400 text-xs">드림코어 터미널 v2.0</span>
        <span className="ml-auto text-zinc-600 text-[10px]">Tab: 자동완성 · ↑↓: 히스토리</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {lines.map((line, i) => (
          <div key={i} className={
            line.type === "input"   ? "text-cyan-400" :
            line.type === "error"   ? "text-red-400" :
            line.type === "success" ? "text-emerald-400" :
            "text-green-300"
          }>
            {line.text}
          </div>
        ))}
        {suggestions.length > 0 && (
          <div className="text-yellow-400/70 text-[10px]">{suggestions.join("  ")}</div>
        )}
      </div>
      <div className="flex items-center gap-1 px-3 py-2 border-t border-zinc-800">
        <span className="text-cyan-400">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setSuggestions([]); }}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-green-300 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
          data-testid="terminal-input"
          placeholder="명령어 입력..."
        />
      </div>
    </div>
  );
}

// ── 유저 상세 모달 ─────────────────────────────────
function UserDetailPanel({ user, onClose, isMaster }: { user: any; onClose: () => void; isMaster: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currAmount, setCurrAmount] = useState("");
  const [currMode, setCurrMode] = useState<"set" | "add" | "subtract">("add");
  const [newRole, setNewRole] = useState(user.role);
  const [giveItemId, setGiveItemId] = useState("");
  const [newPw, setNewPw] = useState("");

  const setCurrency = useAdminSetCurrency();
  const setRole = useAdminSetRole();
  const giveItem = useAdminGiveItem();
  const resetGamestate = useAdminResetGamestate();
  const clearInventory = useAdminClearInventory();
  const resetPassword = useAdminResetPassword();

  const doSetCurrency = async () => {
    if (!currAmount) return;
    try {
      const r = await setCurrency.mutateAsync({ id: user.id, data: { amount: parseFloat(currAmount), mode: currMode } });
      toast({ title: `재화 변경: ${(r as any).currency?.toLocaleString()} DC` });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      onClose();
    } catch (e: any) { toast({ title: "실패", description: e.response?.data?.error, variant: "destructive" }); }
  };

  const doSetRole = async () => {
    try {
      await setRole.mutateAsync({ id: user.id, data: { role: newRole } });
      toast({ title: `역할 변경: ${newRole}` });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      onClose();
    } catch (e: any) { toast({ title: "실패", description: e.response?.data?.error, variant: "destructive" }); }
  };

  const doGiveItem = async () => {
    if (!giveItemId) return;
    try {
      await giveItem.mutateAsync({ id: user.id, data: { itemId: giveItemId } });
      toast({ title: "아이템 지급 완료" });
    } catch (e: any) { toast({ title: "실패", description: e.response?.data?.error, variant: "destructive" }); }
  };

  const doResetGamestate = async () => {
    try {
      await resetGamestate.mutateAsync({ id: user.id });
      toast({ title: "게임 상태 초기화 완료" });
    } catch { toast({ title: "실패", variant: "destructive" }); }
  };

  const doClearInventory = async () => {
    try {
      await clearInventory.mutateAsync({ id: user.id });
      toast({ title: "인벤토리 초기화 완료" });
    } catch { toast({ title: "실패", variant: "destructive" }); }
  };

  const doResetPassword = async () => {
    if (!newPw) return;
    try {
      await resetPassword.mutateAsync({ id: user.id, data: { newPassword: newPw } });
      toast({ title: "비밀번호 초기화 완료" });
      setNewPw("");
    } catch (e: any) { toast({ title: "실패", description: e.response?.data?.error, variant: "destructive" }); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      className="glass-strong rounded-xl p-5 space-y-4 border border-primary/20"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-lg">{user.nickname}</p>
          <p className="text-xs text-muted-foreground">@{user.username} · ID: {user.id}</p>
          <div className="flex gap-2 mt-1.5">
            <Badge variant="outline" className={
              user.role === "master" ? "text-red-400 border-red-400/30" :
              user.role === "admin" ? "text-orange-400 border-orange-400/30" : ""
            }>{user.role}</Badge>
            <Badge variant="outline" className="text-yellow-400 border-yellow-400/30">
              {user.currency?.toLocaleString()} DC
            </Badge>
            {user.isBanned && <Badge variant="destructive" className="text-xs">금지됨</Badge>}
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
      </div>

      {/* 재화 조정 */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">재화 조정</Label>
        <div className="flex gap-2">
          <Select value={currMode} onValueChange={v => setCurrMode(v as any)}>
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="set">설정</SelectItem>
              <SelectItem value="add">지급</SelectItem>
              <SelectItem value="subtract">차감</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={currAmount}
            onChange={e => setCurrAmount(e.target.value)}
            placeholder="DC 수량"
            className="h-8 text-xs flex-1"
            type="number"
          />
          <Button size="sm" className="h-8 text-xs" onClick={doSetCurrency} disabled={setCurrency.isPending}>
            <DollarSign className="w-3 h-3 mr-1" />적용
          </Button>
        </div>
      </div>

      {/* 역할 변경 (마스터만) */}
      {isMaster && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">역할 변경</Label>
          <div className="flex gap-2">
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="master">master</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 text-xs" onClick={doSetRole} disabled={setRole.isPending || newRole === user.role}>
              <Shield className="w-3 h-3 mr-1" />변경
            </Button>
          </div>
        </div>
      )}

      {/* 아이템 지급 */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">아이템 지급</Label>
        <div className="flex gap-2">
          <Select value={giveItemId} onValueChange={setGiveItemId}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue placeholder="아이템 선택" />
            </SelectTrigger>
            <SelectContent>
              {SHOP_ITEMS.map((item: any) => (
                <SelectItem key={item.id} value={item.id} className="text-xs">
                  {item.name} ({item.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" onClick={doGiveItem} disabled={!giveItemId || giveItem.isPending}>
            <Gift className="w-3 h-3 mr-1" />지급
          </Button>
        </div>
      </div>

      {/* 비밀번호 초기화 (마스터만) */}
      {isMaster && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">비밀번호 초기화</Label>
          <div className="flex gap-2">
            <Input
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="새 비밀번호"
              type="password"
              className="h-8 text-xs flex-1"
            />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={doResetPassword} disabled={!newPw || resetPassword.isPending}>
              <Shield className="w-3 h-3 mr-1" />초기화
            </Button>
          </div>
        </div>
      )}

      {/* 위험 작업 */}
      <div className="space-y-2 pt-2 border-t border-border/20">
        <Label className="text-xs font-semibold text-red-400/70 uppercase tracking-wider">위험 작업</Label>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-7 text-xs border-red-400/30 text-red-400 hover:bg-red-400/10"
            onClick={doResetGamestate} disabled={resetGamestate.isPending}>
            <RefreshCw className="w-3 h-3 mr-1" />게임 상태 초기화
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs border-orange-400/30 text-orange-400 hover:bg-orange-400/10"
            onClick={doClearInventory} disabled={clearInventory.isPending}>
            <Trash2 className="w-3 h-3 mr-1" />인벤토리 초기화
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ── 메인 관리자 페이지 ────────────────────────────
export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [unlocked, setUnlocked] = useState(false);
  const [seqProgress, setSeqProgress] = useState(0);
  const [failFlash, setFailFlash] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 시퀀스 감지
  useEffect(() => {
    if (!isAdmin) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === ADMIN_SEQUENCE[seqProgress]) {
        const next = seqProgress + 1;
        if (next === ADMIN_SEQUENCE.length) { setUnlocked(true); setSeqProgress(0); }
        else setSeqProgress(next);
      } else if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
        setSeqProgress(0);
        setFailFlash(true);
        setTimeout(() => setFailFlash(false), 400);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [seqProgress, isAdmin]);

  const { data: stats } = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey(), enabled: unlocked } });
  const { data: users = [] } = useListUsers({ query: { queryKey: getListUsersQueryKey(), enabled: unlocked } });
  const { data: worldSettings } = useGetWorldSettings({ query: { queryKey: getGetWorldSettingsQueryKey(), enabled: unlocked } });
  const { data: logs = [] } = useGetAdminLogs({}, { query: { queryKey: getGetAdminLogsQueryKey(), enabled: unlocked } });
  const { data: anomalies = [] } = useGetAnomalies({ query: { queryKey: getGetAnomaliesQueryKey(), enabled: unlocked } });
  const { data: reports = [] } = useListReports({ query: { queryKey: getListReportsQueryKey(), enabled: unlocked } });
  const { data: servers = [] } = useListServers({ query: { queryKey: getListServersQueryKey(), enabled: unlocked } });
  const { data: economy } = useGetAdminEconomy({ query: { queryKey: getGetAdminEconomyQueryKey(), enabled: unlocked } });

  const banUser = useBanUser();
  const deleteUser = useDeleteUser();
  const updateWorld = useUpdateWorldSettings();
  const sendAnnouncement = useSendAnnouncement();
  const updateReport = useUpdateReport();
  const deleteServer = useDeleteServer();
  const giveAll = useAdminGiveAll();
  const broadcastEvent = useAdminBroadcastEvent();

  const [announceText, setAnnounceText] = useState("");
  const [giveAllAmount, setGiveAllAmount] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [worldVals, setWorldVals] = useState({
    complexity: 5, trapRate: 0.1, ambientDarkness: 0.7, mapWarp: false,
    wallThickness: 1.0, entitySpawnRate: 0.05, glitchFrequency: 0.1,
  });

  useEffect(() => {
    if (worldSettings) setWorldVals(prev => ({
      ...prev,
      complexity: (worldSettings as any).complexity ?? 5,
      trapRate: (worldSettings as any).trapRate ?? 0.1,
      ambientDarkness: (worldSettings as any).ambientDarkness ?? 0.7,
      mapWarp: (worldSettings as any).mapWarp ?? false,
      wallThickness: (worldSettings as any).wallThickness ?? 1.0,
      entitySpawnRate: (worldSettings as any).entitySpawnRate ?? 0.05,
      glitchFrequency: (worldSettings as any).glitchFrequency ?? 0.1,
    }));
  }, [worldSettings]);

  const handleBan = async (userId: number, banned: boolean) => {
    await banUser.mutateAsync({ id: userId, data: { banned } });
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    toast({ title: banned ? "채팅 금지 처리됨" : "채팅 금지 해제됨" });
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await deleteUser.mutateAsync({ id: userId });
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    toast({ title: "유저 삭제됨" });
    setSelectedUser(null);
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
    toast({ title: "공지 전송됨", description: announceText });
  };

  const handleGiveAll = async () => {
    const amount = parseInt(giveAllAmount);
    if (!amount || amount <= 0) return;
    try {
      await giveAll.mutateAsync({ data: { amount } });
      toast({ title: `전체 유저에게 ${amount.toLocaleString()} DC 지급 완료` });
      setGiveAllAmount("");
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (e: any) { toast({ title: "실패", description: e.response?.data?.error, variant: "destructive" }); }
  };

  const handleEvent = async (eventType: string) => {
    try {
      await broadcastEvent.mutateAsync({ data: { eventType } });
      toast({ title: `이벤트 발생: ${eventType}` });
    } catch { toast({ title: "실패", variant: "destructive" }); }
  };

  const filteredUsers = (users as any[]).filter((u: any) =>
    !userSearch || u.nickname?.includes(userSearch) || u.username?.includes(userSearch) || String(u.id) === userSearch
  );

  // 잠금 화면
  if (!unlocked) {
    return (
      <div className={`min-h-screen dreamcore-bg flex items-center justify-center transition-colors ${failFlash ? "bg-red-900/10" : ""}`}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="glass rounded-2xl p-10 max-w-sm mx-auto text-center">
            <h2 className="text-xl font-bold mb-2">🔐 관리자 접근</h2>
            <p className="text-muted-foreground text-sm mb-6">키보드 시퀀스를 입력하세요</p>
            <div className="flex justify-center gap-2 mb-6">
              {ADMIN_SEQUENCE.map((key, i) => {
                const sym: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
                return (
                  <div key={i} className={`w-8 h-8 rounded flex items-center justify-center text-sm border transition-all duration-200 ${
                    i < seqProgress ? "bg-primary/30 border-primary/50 text-primary scale-110" :
                    i === seqProgress ? "border-primary/50 text-primary animate-pulse" :
                    "border-border/30 text-muted-foreground"
                  }`}>
                    {sym[key]}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">진행: {seqProgress}/{ADMIN_SEQUENCE.length}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen dreamcore-bg">
      <NavBar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-red-400">🛡️ 관리자 콘솔</h1>
            <p className="text-muted-foreground text-sm">{user?.nickname} — {user?.role} 권한</p>
          </div>
          <Button variant="outline" size="sm" className="text-xs"
            onClick={() => queryClient.invalidateQueries()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />전체 새로고침
          </Button>
        </motion.div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-6 bg-muted/50 flex-wrap h-auto gap-1">
            <TabsTrigger value="dashboard"><BarChart3 className="w-3.5 h-3.5 mr-1" />대시보드</TabsTrigger>
            <TabsTrigger value="users"><Users className="w-3.5 h-3.5 mr-1" />유저 관리</TabsTrigger>
            <TabsTrigger value="economy"><DollarSign className="w-3.5 h-3.5 mr-1" />경제</TabsTrigger>
            <TabsTrigger value="world"><Globe className="w-3.5 h-3.5 mr-1" />월드 제어</TabsTrigger>
            <TabsTrigger value="servers"><Server className="w-3.5 h-3.5 mr-1" />서버</TabsTrigger>
            <TabsTrigger value="terminal"><Terminal className="w-3.5 h-3.5 mr-1" />터미널</TabsTrigger>
            <TabsTrigger value="logs"><FileText className="w-3.5 h-3.5 mr-1" />로그</TabsTrigger>
            <TabsTrigger value="reports"><AlertTriangle className="w-3.5 h-3.5 mr-1" />신고</TabsTrigger>
          </TabsList>

          {/* 대시보드 */}
          <TabsContent value="dashboard">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "총 유저", value: (stats as any)?.totalUsers ?? "-", color: "text-blue-400" },
                { label: "접속 중", value: (stats as any)?.onlineUsers ?? "-", color: "text-green-400" },
                { label: "활성 서버", value: (stats as any)?.activeServers ?? "-", color: "text-purple-400" },
                { label: "미처리 신고", value: (stats as any)?.pendingReports ?? "-", color: "text-red-400" },
                { label: "오늘 가입", value: (stats as any)?.recentSignups ?? "-", color: "text-cyan-400" },
                { label: "금지된 유저", value: (stats as any)?.bannedUsers ?? "-", color: "text-orange-400" },
                { label: "유통 재화", value: ((stats as any)?.totalCurrencyCirculating ?? 0).toLocaleString(), color: "text-yellow-400" },
                { label: "전체 서버", value: (stats as any)?.totalServers ?? "-", color: "text-violet-400" },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }} className="glass rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </motion.div>
              ))}
            </div>

            {/* 공지 전송 */}
            <div className="glass rounded-xl p-5 mb-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Megaphone className="w-4 h-4 text-primary" />전체 공지 전송</h3>
              <div className="flex gap-2">
                <Input value={announceText} onChange={e => setAnnounceText(e.target.value)}
                  placeholder="공지 메시지를 입력하세요..." data-testid="input-announcement"
                  onKeyDown={e => e.key === "Enter" && handleAnnounce()} />
                <Button onClick={handleAnnounce} disabled={sendAnnouncement.isPending} data-testid="button-send-announcement">
                  전송
                </Button>
              </div>
            </div>

            {/* 이벤트 발생 */}
            <div className="glass rounded-xl p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" />전체 서버 이벤트</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { id: "blackout", label: "⬛ 블랙아웃", desc: "전체 화면 암전" },
                  { id: "entity_surge", label: "👾 엔티티 폭증", desc: "엔티티 대량 생성" },
                  { id: "map_warp", label: "🌀 맵 워프", desc: "맵 랜덤 왜곡" },
                  { id: "glitch_storm", label: "⚡ 글리치 폭풍", desc: "화면 글리치 효과" },
                  { id: "currency_rain", label: "💰 재화 비", desc: "랜덤 재화 지급" },
                  { id: "portal_open", label: "🌌 포탈 개방", desc: "숨겨진 구역 열기" },
                ].map(ev => (
                  <Button key={ev.id} variant="outline"
                    className="h-auto py-2 px-3 flex flex-col items-start text-left hover:bg-primary/10"
                    data-testid={`button-event-${ev.id}`}
                    onClick={() => handleEvent(ev.id)} disabled={broadcastEvent.isPending}>
                    <span className="text-sm">{ev.label}</span>
                    <span className="text-[10px] text-muted-foreground/60">{ev.desc}</span>
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* 유저 관리 */}
          <TabsContent value="users">
            <div className={`grid gap-4 ${selectedUser ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1"}`}>
              <div className={selectedUser ? "lg:col-span-2" : ""}>
                <div className="glass rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/20 flex items-center gap-3">
                    <Input
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      placeholder="닉네임 / 아이디 / ID 검색..."
                      className="h-8 text-xs flex-1"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{filteredUsers.length}명</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/30 text-muted-foreground text-xs">
                          <th className="text-left px-4 py-2.5">ID</th>
                          <th className="text-left px-4 py-2.5">닉네임</th>
                          <th className="text-left px-4 py-2.5">역할</th>
                          <th className="text-left px-4 py-2.5">재화</th>
                          <th className="text-left px-4 py-2.5">상태</th>
                          <th className="text-right px-4 py-2.5">작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((u: any) => (
                          <tr key={u.id}
                            className={`border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer ${selectedUser?.id === u.id ? "bg-primary/5" : ""}`}
                            onClick={() => setSelectedUser(u.id === selectedUser?.id ? null : u)}
                            data-testid={`row-user-${u.id}`}>
                            <td className="px-4 py-2.5 text-muted-foreground text-xs">{u.id}</td>
                            <td className="px-4 py-2.5 font-medium">{u.nickname}</td>
                            <td className="px-4 py-2.5">
                              <Badge variant="outline" className={`text-xs ${
                                u.role === "master" ? "text-red-400 border-red-400/30" :
                                u.role === "admin" ? "text-orange-400 border-orange-400/30" : ""
                              }`}>{u.role}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-yellow-400 text-xs">{(u.currency || 0).toLocaleString()}</td>
                            <td className="px-4 py-2.5">
                              {u.isBanned
                                ? <Badge variant="destructive" className="text-xs">금지됨</Badge>
                                : <span className="text-xs text-green-400">정상</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                                  onClick={() => handleBan(u.id, !u.isBanned)}>
                                  {u.isBanned ? "해제" : "금지"}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-primary"
                                  onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}>
                                  <Eye className="w-3 h-3" />
                                </Button>
                                {user?.role === "master" && u.role !== "master" && (
                                  <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2"
                                    onClick={() => handleDeleteUser(u.id)}>
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
                </div>
              </div>

              {/* 유저 상세 패널 */}
              <AnimatePresence>
                {selectedUser && (
                  <UserDetailPanel
                    user={selectedUser}
                    isMaster={user?.role === "master"}
                    onClose={() => setSelectedUser(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          </TabsContent>

          {/* 경제 */}
          <TabsContent value="economy">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass rounded-xl p-6 space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-yellow-400" />경제 현황</h3>
                <div className="space-y-2">
                  {[
                    { label: "총 유통 재화", value: `${((economy as any)?.totalCirculating ?? 0).toLocaleString()} DC` },
                    { label: "평균 보유량", value: `${((economy as any)?.averageCurrency ?? 0).toLocaleString()} DC` },
                    { label: "최고 보유량", value: `${((economy as any)?.maxCurrency ?? 0).toLocaleString()} DC` },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-border/20">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <span className="text-sm font-semibold text-yellow-400">{item.value}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">상위 부자 목록</p>
                  {((economy as any)?.richest ?? []).slice(0, 8).map((u: any, i: number) => (
                    <div key={u.id} className="flex items-center justify-between py-1">
                      <span className="text-xs text-muted-foreground">{i + 1}. {u.nickname}</span>
                      <span className="text-xs text-yellow-400">{u.currency.toLocaleString()} DC</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-xl p-6 space-y-5">
                <h3 className="font-semibold flex items-center gap-2"><Gift className="w-4 h-4 text-green-400" />전체 재화 지급</h3>
                <p className="text-xs text-muted-foreground">모든 유저에게 동일한 재화를 지급합니다.</p>
                <div className="flex gap-2">
                  <Input
                    value={giveAllAmount}
                    onChange={e => setGiveAllAmount(e.target.value)}
                    placeholder="지급할 DC 수량"
                    type="number"
                    className="flex-1"
                  />
                  <Button onClick={handleGiveAll} disabled={giveAll.isPending || !giveAllAmount}>
                    전체 지급
                  </Button>
                </div>

                <div className="pt-4 border-t border-border/20">
                  <h4 className="text-sm font-medium mb-3">재화 비 이벤트</h4>
                  <p className="text-xs text-muted-foreground mb-3">currency_rain 이벤트를 발생시키면 랜덤 재화가 지급됩니다.</p>
                  <Button variant="outline" className="w-full" onClick={() => handleEvent("currency_rain")}>
                    💰 재화 비 이벤트 발생
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 월드 제어 */}
          <TabsContent value="world">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass rounded-xl p-6 space-y-5">
                <h3 className="font-semibold">미로 설정</h3>
                {[
                  { key: "complexity", label: "복잡도", min: 1, max: 10, step: 1, format: (v: number) => v.toString() },
                  { key: "trapRate", label: "함정 비율", min: 0, max: 100, step: 1, format: (v: number) => (v / 100).toFixed(2), val: worldVals.trapRate * 100, onChange: (v: number) => v / 100 },
                  { key: "ambientDarkness", label: "어둠 정도", min: 0, max: 100, step: 1, format: (v: number) => (v / 100).toFixed(2), val: worldVals.ambientDarkness * 100, onChange: (v: number) => v / 100 },
                  { key: "entitySpawnRate", label: "엔티티 생성 비율", min: 0, max: 50, step: 1, format: (v: number) => (v / 100).toFixed(2), val: worldVals.entitySpawnRate * 100, onChange: (v: number) => v / 100 },
                  { key: "glitchFrequency", label: "글리치 빈도", min: 0, max: 100, step: 1, format: (v: number) => (v / 100).toFixed(2), val: worldVals.glitchFrequency * 100, onChange: (v: number) => v / 100 },
                  { key: "wallThickness", label: "벽 두께", min: 50, max: 300, step: 1, format: (v: number) => (v / 100).toFixed(2), val: worldVals.wallThickness * 100, onChange: (v: number) => v / 100 },
                ].map(({ key, label, min, max, step, format, val, onChange }) => {
                  const rawVal = val ?? (worldVals as any)[key];
                  return (
                    <div key={key} className="space-y-2">
                      <Label className="text-sm">{label}: {format(rawVal)}</Label>
                      <Slider
                        value={[rawVal]}
                        onValueChange={([v]) => setWorldVals(prev => ({ ...prev, [key]: onChange ? onChange(v) : v }))}
                        min={min} max={max} step={step}
                        data-testid={`slider-${key}`}
                      />
                    </div>
                  );
                })}
                <div className="flex items-center gap-3">
                  <Switch checked={worldVals.mapWarp} onCheckedChange={v => setWorldVals(prev => ({ ...prev, mapWarp: v }))} data-testid="switch-mapwarp" />
                  <Label>맵 워프 활성화</Label>
                </div>
                <Button onClick={handleWorldSave} className="w-full" disabled={updateWorld.isPending} data-testid="button-save-world">
                  설정 저장
                </Button>
              </div>

              <div className="glass rounded-xl p-6 space-y-3">
                <h3 className="font-semibold">이벤트 제어</h3>
                {[
                  { id: "blackout", label: "⬛ 전체 블랙아웃", desc: "모든 서버 화면 암전" },
                  { id: "entity_surge", label: "👾 엔티티 폭증", desc: "엔티티 대량 스폰" },
                  { id: "map_warp", label: "🌀 맵 워프", desc: "미로 구조 랜덤 왜곡" },
                  { id: "glitch_storm", label: "⚡ 글리치 폭풍", desc: "시각 글리치 이펙트" },
                  { id: "currency_rain", label: "💰 재화 비", desc: "랜덤 재화 지급" },
                  { id: "portal_open", label: "🌌 포탈 개방", desc: "숨겨진 구역 활성화" },
                ].map(ev => (
                  <Button key={ev.id} variant="outline" className="w-full justify-start h-auto py-2.5"
                    onClick={() => handleEvent(ev.id)} disabled={broadcastEvent.isPending}>
                    <span className="flex-1 text-left">
                      <span className="block text-sm">{ev.label}</span>
                      <span className="block text-[10px] text-muted-foreground/60">{ev.desc}</span>
                    </span>
                    <Zap className="w-3.5 h-3.5 text-yellow-400 ml-2" />
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* 서버 제어 */}
          <TabsContent value="servers">
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground text-xs">
                    <th className="text-left px-4 py-3">ID</th>
                    <th className="text-left px-4 py-3">이름</th>
                    <th className="text-left px-4 py-3">인원</th>
                    <th className="text-left px-4 py-3">상태</th>
                    <th className="text-left px-4 py-3">복잡도</th>
                    <th className="text-right px-4 py-3">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {(servers as any[]).map((s: any) => (
                    <tr key={s.id} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{s.id}</td>
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-xs">{s.currentPlayers}/{s.maxPlayers}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={s.status === "active" ? "text-green-400 border-green-400/30" : "text-muted-foreground"}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{s.complexity}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="destructive" className="h-6 text-xs"
                          onClick={() => deleteServer.mutateAsync({ serverId: s.id })}>
                          종료
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(servers as any[]).length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">활성 서버 없음</td></tr>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border/20 text-sm font-medium">서버 로그</div>
                <div className="divide-y divide-border/10 max-h-96 overflow-y-auto">
                  {(logs as any[]).slice(0, 50).map((log: any) => (
                    <div key={log.id} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant="outline" className="text-[10px] shrink-0">{log.type}</Badge>
                        <p className="text-xs text-foreground/80 flex-1">{log.message}</p>
                        <span className="text-[10px] text-muted-foreground/50 shrink-0">
                          {new Date(log.createdAt).toLocaleTimeString("ko-KR")}
                        </span>
                      </div>
                    </div>
                  ))}
                  {(logs as any[]).length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm">로그 없음</div>
                  )}
                </div>
              </div>
              <div className="glass rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border/20 text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />이상 현상
                </div>
                <div className="divide-y divide-border/10 max-h-96 overflow-y-auto">
                  {(anomalies as any[]).slice(0, 30).map((a: any) => (
                    <div key={a.id} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${
                          a.severity === "high" ? "text-red-400 border-red-400/30" :
                          a.severity === "medium" ? "text-yellow-400 border-yellow-400/30" : ""
                        }`}>{a.severity}</Badge>
                        <div className="flex-1">
                          <p className="text-xs font-medium">{a.type}</p>
                          <p className="text-[10px] text-muted-foreground">{a.nickname} — {a.detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(anomalies as any[]).length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm">이상 현상 없음</div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 신고 */}
          <TabsContent value="reports">
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground text-xs">
                    <th className="text-left px-4 py-3">ID</th>
                    <th className="text-left px-4 py-3">신고자</th>
                    <th className="text-left px-4 py-3">대상</th>
                    <th className="text-left px-4 py-3">사유</th>
                    <th className="text-left px-4 py-3">상태</th>
                    <th className="text-right px-4 py-3">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {(reports as any[]).map((r: any) => (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.id}</td>
                      <td className="px-4 py-3">{r.reporterNickname}</td>
                      <td className="px-4 py-3 font-medium">{r.targetNickname}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.reason}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs ${
                          r.status === "pending" ? "text-yellow-400 border-yellow-400/30" :
                          r.status === "resolved" ? "text-green-400 border-green-400/30" : ""
                        }`}>{r.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" className="h-6 text-xs"
                            onClick={() => updateReport.mutateAsync({ reportId: r.id, data: { status: "resolved" } })}>
                            해결
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-xs"
                            onClick={() => updateReport.mutateAsync({ reportId: r.id, data: { status: "dismissed" } })}>
                            기각
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(reports as any[]).length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">신고 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
