// 상점 페이지: 스킨, 손전등, 업그레이드
import { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListShopItems, useBuyShopItem, useEquipSkin, useGetUserInventory,
  useGetMe, useListUpgrades, usePurchaseUpgrade,
  getListShopItemsQueryKey, getGetUserInventoryQueryKey, getGetMeQueryKey,
  getGetGameStateQueryKey, getListUpgradesQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import NavBar from "@/components/NavBar";
import { ShoppingCart, Check, Zap } from "lucide-react";

const RARITY_COLORS: Record<string, string> = {
  common: "text-gray-400 border-gray-400/30",
  uncommon: "text-green-400 border-green-400/30",
  rare: "text-blue-400 border-blue-400/30",
  epic: "text-purple-400 border-purple-400/30",
  legendary: "text-yellow-400 border-yellow-400/30",
  admin: "text-red-400 border-red-400/30",
};

const RARITY_LABELS: Record<string, string> = {
  common: "커먼", uncommon: "언커먼", rare: "레어",
  epic: "에픽", legendary: "레전더리", admin: "관리자",
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

  const buyItem = useBuyShopItem();
  const equipSkin = useEquipSkin();
  const purchaseUpgrade = usePurchaseUpgrade();

  const owned = new Set((inventory as any[]).map((i: any) => i.itemId));

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

  const handleUpgrade = async (upgradeId: string, name: string) => {
    try {
      await purchaseUpgrade.mutateAsync({ upgradeId });
      queryClient.invalidateQueries({ queryKey: getGetGameStateQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: `${name} 업그레이드 완료` });
    } catch (err: any) {
      toast({ title: "업그레이드 실패", description: err.response?.data?.error, variant: "destructive" });
    }
  };

  const skins = (items as any[]).filter((i: any) => i.type === "skin");
  const tools = (items as any[]).filter((i: any) => i.type === "tool" || i.type === "flashlight");

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
            <div className="glass rounded-xl px-4 py-2 flex items-center gap-2">
              <span className="text-yellow-400 text-sm">DC</span>
              <span className="font-bold">{(user?.currency ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </motion.div>

        <Tabs defaultValue="skins">
          <TabsList className="mb-6 bg-muted/50">
            <TabsTrigger value="skins" data-testid="tab-skins">스킨</TabsTrigger>
            <TabsTrigger value="tools" data-testid="tab-tools">장비</TabsTrigger>
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
                    {/* 스킨 미리보기 */}
                    <div
                      className="w-14 h-14 rounded-full"
                      style={{ background: item.color || "#8b5cf6", boxShadow: `0 0 20px ${item.color || "#8b5cf6"}60` }}
                    />
                    <p className="text-sm font-medium text-center">{item.name}</p>
                    <Badge variant="outline" className={`text-xs ${RARITY_COLORS[item.rarity] || ""}`}>
                      {RARITY_LABELS[item.rarity] || item.rarity}
                    </Badge>
                    <p className="text-xs text-muted-foreground">DC {item.price.toLocaleString()}</p>
                    {isEquipped ? (
                      <Button size="sm" variant="outline" onClick={() => handleEquip(null)} className="w-full text-xs">
                        <Check className="w-3 h-3 mr-1" />장착 중
                      </Button>
                    ) : isOwned ? (
                      <Button size="sm" onClick={() => handleEquip(item.id, item.name)} className="w-full text-xs">
                        장착
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => handleBuy(item.id, item.name)} className="w-full text-xs" disabled={buyItem.isPending}>
                        <ShoppingCart className="w-3 h-3 mr-1" />구매
                      </Button>
                    )}
                  </motion.div>
                );
              })}
              {skins.length === 0 && (
                <div className="col-span-4 text-center py-16 text-muted-foreground">로딩 중...</div>
              )}
            </div>
          </TabsContent>

          {/* 장비 탭 */}
          <TabsContent value="tools">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tools.map((item: any, i: number) => {
                const isOwned = owned.has(item.id);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass rounded-xl p-5 flex items-center gap-4"
                    data-testid={`card-tool-${item.id}`}
                  >
                    <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center text-2xl">
                      {item.icon || ""}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      <p className="text-xs text-yellow-400 mt-1">DC {item.price.toLocaleString()}</p>
                    </div>
                    {isOwned ? (
                      <Button size="sm" variant="outline" disabled>보유 중</Button>
                    ) : (
                      <Button size="sm" onClick={() => handleBuy(item.id, item.name)} disabled={buyItem.isPending}>
                        구매
                      </Button>
                    )}
                  </motion.div>
                );
              })}
              {tools.length === 0 && (
                <div className="col-span-2 text-center py-16 text-muted-foreground">장비 없음</div>
              )}
            </div>
          </TabsContent>

          {/* 업그레이드 탭 */}
          <TabsContent value="upgrades">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(upgrades as any[]).map((upg: any, i: number) => (
                <motion.div
                  key={upg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass rounded-xl p-5"
                  data-testid={`card-upgrade-${upg.id}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">{upg.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{upg.description}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{upg.category || "일반"}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-yellow-400">DC {upg.cost.toLocaleString()} / 레벨</span>
                    <Button
                      size="sm"
                      onClick={() => handleUpgrade(upg.id, upg.name)}
                      disabled={purchaseUpgrade.isPending}
                    >
                      <Zap className="w-3.5 h-3.5 mr-1" />
                      업그레이드
                    </Button>
                  </div>
                </motion.div>
              ))}
              {(upgrades as any[]).length === 0 && (
                <div className="col-span-2 text-center py-16 text-muted-foreground">업그레이드 없음</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
