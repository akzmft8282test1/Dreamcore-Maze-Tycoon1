// 상점 페이지: 스킨, 손전등, 업그레이드
import { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListShopItems, useBuyShopItem, useEquipSkin, useGetUserInventory,
  useListUpgrades, usePurchaseUpgrade, useGetGameState, useGetMe,
  getListShopItemsQueryKey, getGetUserInventoryQueryKey, getGetMeQueryKey,
  getGetGameStateQueryKey, getListUpgradesQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import NavBar from "@/components/NavBar";
import { ShoppingCart, Check, Zap, RefreshCw } from "lucide-react";

const RARITY_COLORS: Record<string, string> = {
  common:    "text-gray-400 border-gray-400/30",
  uncommon:  "text-green-400 border-green-400/30",
  rare:      "text-blue-400 border-blue-400/30",
  epic:      "text-purple-400 border-purple-400/30",
  legendary: "text-yellow-400 border-yellow-400/30",
  admin:     "text-red-400 border-red-400/30",
};

const RARITY_LABELS: Record<string, string> = {
  common: "커먼", uncommon: "언커먼", rare: "레어",
  epic: "에픽", legendary: "레전더리", admin: "관리자",
};

const CATEGORY_LABELS: Record<string, string> = {
  personal: "개인", server: "서버", party: "파티",
};

const FLASHLIGHT_ICONS: Record<string, string> = {
  flashlight_basic: "🔦",
  flashlight_wide: "💡",
  flashlight_uv: "🔮",
  flashlight_dreamcore: "🕯️",
};

export default function ShopPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: items = [] } = useListShopItems({ query: { queryKey: getListShopItemsQueryKey() } });
  const { data: inventory = [] } = useGetUserInventory(user?.id ?? 0, {
    query: { queryKey: getGetUserInventoryQueryKey(user?.id ?? 0), enabled: !!user }
  });
  const { data: upgrades = [] } = useListUpgrades({ query: { queryKey: getListUpgradesQueryKey() } });
  const { data: gameState } = useGetGameState({
    query: { queryKey: getGetGameStateQueryKey(), enabled: !!user }
  });

  const buyItem = useBuyShopItem();
  const equipSkin = useEquipSkin();
  const purchaseUpgrade = usePurchaseUpgrade();

  const owned = new Set((inventory as any[]).map((i: any) => i.itemId));
  const currentUpgrades = ((gameState as any)?.upgrades as Record<string, number>) || {};

  // usersTable.currency 기준으로 표시 (실제 잔고)
  const displayCurrency = user?.currency ?? 0;

  const handleBuy = async (itemId: string, name: string) => {
    try {
      await buyItem.mutateAsync({ data: { itemId } });
      queryClient.invalidateQueries({ queryKey: getGetUserInventoryQueryKey(user?.id ?? 0) });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: `${name}을(를) 구매했습니다` });
    } catch (err: any) {
      toast({ title: "구매 실패", description: err.response?.data?.error, variant: "destructive" });
    }
  };

  const handleEquip = async (itemId: string | null, name?: string) => {
    try {
      await equipSkin.mutateAsync({ data: { itemId } });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: itemId ? `${name} 장착됨` : "스킨 해제됨" });
    } catch (err: any) {
      toast({ title: "장착 실패", description: err.response?.data?.error, variant: "destructive" });
    }
  };

  const handleUpgrade = async (upgradeId: string, name: string, cost: number, nextLevel: number) => {
    const totalCost = cost * nextLevel;
    if (displayCurrency < totalCost) {
      toast({
        title: "재화 부족",
        description: `필요: ${totalCost.toLocaleString()} DC, 보유: ${displayCurrency.toLocaleString()} DC`,
        variant: "destructive",
      });
      return;
    }
    try {
      await purchaseUpgrade.mutateAsync({ upgradeId });
      queryClient.invalidateQueries({ queryKey: getGetGameStateQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: `${name} Lv.${nextLevel} 업그레이드 완료`, description: `-${totalCost.toLocaleString()} DC` });
    } catch (err: any) {
      toast({ title: "업그레이드 실패", description: err.response?.data?.error, variant: "destructive" });
    }
  };

  const skins = (items as any[]).filter((i: any) => i.type === "skin");
  const flashlights = (items as any[]).filter((i: any) => i.type === "flashlight");
  const equippedFlashlight = (user as any)?.equippedFlashlight ?? null;

  const handleEquipFlashlight = async (itemId: string | null) => {
    try {
      await equipSkin.mutateAsync({ data: { itemId: itemId ?? "flashlight_none" } });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: itemId ? "손전등 장착됨" : "손전등 해제됨" });
    } catch (err: any) {
      toast({ title: "장착 실패", description: err.response?.data?.error, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen dreamcore-bg">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">상점</h1>
              <p className="text-muted-foreground text-sm mt-1">스킨, 장비, 업그레이드 구매</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetGameStateQueryKey() });
                }}
                title="잔고 새로고침"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <div className="glass rounded-xl px-4 py-2 flex items-center gap-2">
                <span className="text-yellow-400 text-sm font-medium">DC</span>
                <span className="font-bold text-lg">{displayCurrency.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </motion.div>

        <Tabs defaultValue="skins">
          <TabsList className="mb-6 bg-muted/50">
            <TabsTrigger value="skins" data-testid="tab-skins">스킨</TabsTrigger>
            <TabsTrigger value="flashlights" data-testid="tab-tools">손전등</TabsTrigger>
            <TabsTrigger value="upgrades" data-testid="tab-upgrades">업그레이드</TabsTrigger>
          </TabsList>

          {/* 스킨 탭 */}
          <TabsContent value="skins">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {skins.map((item: any, i: number) => {
                const isOwned = owned.has(item.id);
                const isEquipped = user?.equippedSkin === item.id;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className={`glass rounded-xl p-4 flex flex-col items-center gap-3 ${isEquipped ? "glow-purple border-primary/40" : ""}`}
                    data-testid={`card-skin-${item.id}`}
                  >
                    <div
                      className="w-14 h-14 rounded-full"
                      style={{ background: item.color || "#8b5cf6", boxShadow: `0 0 20px ${item.color || "#8b5cf6"}60` }}
                    />
                    <p className="text-sm font-medium text-center">{item.name}</p>
                    <Badge variant="outline" className={`text-xs ${RARITY_COLORS[item.rarity] || ""}`}>
                      {RARITY_LABELS[item.rarity] || item.rarity}
                    </Badge>
                    {item.price > 0 && (
                      <p className="text-xs text-muted-foreground">DC {item.price.toLocaleString()}</p>
                    )}
                    {isEquipped ? (
                      <Button size="sm" variant="outline" onClick={() => handleEquip(null)} className="w-full text-xs">
                        <Check className="w-3 h-3 mr-1" />장착 중
                      </Button>
                    ) : isOwned ? (
                      <Button size="sm" onClick={() => handleEquip(item.id, item.name)} className="w-full text-xs">
                        장착
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => handleBuy(item.id, item.name)} className="w-full text-xs"
                        disabled={buyItem.isPending || displayCurrency < item.price}>
                        <ShoppingCart className="w-3 h-3 mr-1" />구매
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </TabsContent>

          {/* 손전등 탭 */}
          <TabsContent value="flashlights">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {flashlights.map((item: any, i: number) => {
                const isOwned = owned.has(item.id);
                const isEquipped = equippedFlashlight === item.id;
                const icon = FLASHLIGHT_ICONS[item.id] ?? "🔦";
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`glass rounded-xl p-5 flex items-center gap-4 ${isEquipped ? "border-primary/30" : ""}`}
                    data-testid={`card-tool-${item.id}`}
                  >
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0"
                      style={{ background: `${item.color || "#ffffff"}18`, boxShadow: isEquipped ? `0 0 12px ${item.color}60` : "none" }}
                    >
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{item.name}</p>
                        {isEquipped && <Badge className="text-xs bg-primary/20 text-primary border-primary/30">장착 중</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      <p className="text-xs text-yellow-400 mt-1">DC {item.price.toLocaleString()}</p>
                    </div>
                    <div className="shrink-0">
                      {isOwned ? (
                        isEquipped ? (
                          <Button size="sm" variant="outline" className="text-xs"
                            onClick={() => handleEquipFlashlight(null)}>
                            해제
                          </Button>
                        ) : (
                          <Button size="sm" className="text-xs"
                            onClick={() => handleEquipFlashlight(item.id)}>
                            장착
                          </Button>
                        )
                      ) : (
                        <Button size="sm" className="text-xs"
                          onClick={() => handleBuy(item.id, item.name)}
                          disabled={buyItem.isPending || displayCurrency < item.price}>
                          <ShoppingCart className="w-3 h-3 mr-1" />구매
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </TabsContent>

          {/* 업그레이드 탭 */}
          <TabsContent value="upgrades">
            <div className="space-y-3">
              {/* 카테고리별 그룹 */}
              {["personal", "server", "party"].map(category => {
                const catUpgrades = (upgrades as any[]).filter((u: any) => u.category === category);
                if (!catUpgrades.length) return null;
                return (
                  <div key={category}>
                    <p className="text-xs text-muted-foreground/60 uppercase tracking-wider px-1 mb-2">
                      {CATEGORY_LABELS[category] ?? category} 업그레이드
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {catUpgrades.map((upg: any, i: number) => {
                        const currentLevel = currentUpgrades[upg.id] || 0;
                        const maxLevel = upg.maxLevel;
                        const isMax = currentLevel >= maxLevel;
                        const nextLevel = currentLevel + 1;
                        const nextCost = isMax ? 0 : upg.cost * nextLevel;
                        const canAfford = displayCurrency >= nextCost;

                        return (
                          <motion.div
                            key={upg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className={`glass rounded-xl p-5 ${isMax ? "opacity-70" : ""}`}
                            data-testid={`card-upgrade-${upg.id}`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0 pr-3">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm">{upg.name}</p>
                                  {isMax && <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-400/30">최대</Badge>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{upg.description}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-bold text-primary">Lv.{currentLevel}</p>
                                <p className="text-[10px] text-muted-foreground">/ {maxLevel}</p>
                              </div>
                            </div>

                            {/* 레벨 바 */}
                            <div className="mb-3">
                              <Progress value={(currentLevel / maxLevel) * 100} className="h-1.5" />
                            </div>

                            <div className="flex items-center justify-between">
                              {!isMax ? (
                                <span className={`text-xs ${canAfford ? "text-yellow-400" : "text-red-400/70"}`}>
                                  {nextCost.toLocaleString()} DC {!canAfford && "(부족)"}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">업그레이드 완료</span>
                              )}
                              <Button
                                size="sm"
                                onClick={() => handleUpgrade(upg.id, upg.name, upg.cost, nextLevel)}
                                disabled={isMax || purchaseUpgrade.isPending || !canAfford}
                                className={`text-xs ${isMax ? "opacity-40" : !canAfford ? "opacity-50" : ""}`}
                              >
                                <Zap className="w-3.5 h-3.5 mr-1" />
                                {isMax ? "완료" : `Lv.${nextLevel} 강화`}
                              </Button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {(upgrades as any[]).length === 0 && (
                <div className="text-center py-16 text-muted-foreground">업그레이드 없음</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
