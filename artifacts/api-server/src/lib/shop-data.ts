// 상점 아이템 정적 데이터
export const SHOP_ITEMS = [
  // 스킨 - 구체 아바타
  { id: "skin_default", name: "기본 구체", description: "기본 흰색 구체 아바타", type: "skin", price: 0, rarity: "common", color: "#ffffff", adminOnly: false },
  { id: "skin_dreamblue", name: "드림 블루", description: "꿈속의 파란빛 구체", type: "skin", price: 500, rarity: "uncommon", color: "#4fc3f7", adminOnly: false },
  { id: "skin_liminal_pink", name: "리미널 핑크", description: "리미널 스페이스의 분홍빛", type: "skin", price: 800, rarity: "uncommon", color: "#f48fb1", adminOnly: false },
  { id: "skin_void_black", name: "보이드 블랙", description: "허공을 삼키는 검정 구체", type: "skin", price: 1200, rarity: "rare", color: "#1a1a2e", adminOnly: false },
  { id: "skin_glitch", name: "글리치", description: "화면이 깨지는 듯한 구체", type: "skin", price: 2000, rarity: "epic", color: "#00e5ff", adminOnly: false },
  { id: "skin_neon_green", name: "네온 그린", description: "형광등 빛을 머금은 구체", type: "skin", price: 1500, rarity: "rare", color: "#69ff47", adminOnly: false },
  { id: "skin_gold", name: "황금 구체", description: "전설의 황금빛 구체", type: "skin", price: 5000, rarity: "legendary", color: "#ffd700", adminOnly: false },
  { id: "skin_admin_red", name: "관리자 레드", description: "관리자 전용 붉은 구체", type: "skin", price: 0, rarity: "admin", color: "#ff1744", adminOnly: true },
  { id: "skin_admin_purple", name: "관리자 퍼플", description: "관리자 전용 보라 구체", type: "skin", price: 0, rarity: "admin", color: "#d500f9", adminOnly: true },

  // 손전등 아이템
  { id: "flashlight_basic", name: "기본 손전등", description: "좁고 흐린 빛", type: "flashlight", price: 200, rarity: "common", color: "#fff9c4", adminOnly: false },
  { id: "flashlight_wide", name: "광각 손전등", description: "넓은 범위를 비추는 손전등", type: "flashlight", price: 800, rarity: "uncommon", color: "#fff3e0", adminOnly: false },
  { id: "flashlight_uv", name: "UV 손전등", description: "숨겨진 메시지를 드러내는 자외선 손전등", type: "flashlight", price: 1500, rarity: "rare", color: "#ce93d8", adminOnly: false },
  { id: "flashlight_dreamcore", name: "드림코어 랜턴", description: "꿈속의 따뜻한 빛을 발산", type: "flashlight", price: 3000, rarity: "epic", color: "#ffe57f", adminOnly: false },
];

// 업그레이드 정적 데이터
export const UPGRADES = [
  // 개인 업그레이드
  { id: "speed_boost", name: "이동 속도 증가", description: "플레이어 이동 속도 +10%", cost: 300, category: "personal", maxLevel: 5, effect: { speedMultiplier: 0.1 } },
  { id: "memory_extractor", name: "기억 추출기 Lv.1", description: "방치형 재화 수집 속도 증가", cost: 500, category: "personal", maxLevel: 10, effect: { idleIncomeMultiplier: 0.2 } },
  { id: "vision_enhance", name: "시야 강화", description: "손전등 범위 +15%", cost: 400, category: "personal", maxLevel: 5, effect: { flashlightRange: 0.15 } },
  { id: "stamina_up", name: "체력 강화", description: "엔티티에게 피격 시 저항력 증가", cost: 600, category: "personal", maxLevel: 5, effect: { resistance: 0.1 } },
  { id: "loot_magnet", name: "기억의 잔상", description: "자동 루팅 범위 증가", cost: 700, category: "personal", maxLevel: 5, effect: { lootRadius: 0.2 } },

  // 서버 업그레이드
  { id: "server_capacity", name: "서버 수용 인원 증가", description: "서버 최대 플레이어 +2", cost: 1000, category: "server", maxLevel: 5, effect: { maxPlayers: 2 } },
  { id: "maze_quality", name: "미로 품질 향상", description: "더 복잡하고 아름다운 미로 생성", cost: 1500, category: "server", maxLevel: 3, effect: { mazeQuality: 1 } },

  // 파티 업그레이드
  { id: "party_share", name: "파티 재화 공유", description: "파티원이 획득한 재화의 일부 공유", cost: 800, category: "party", maxLevel: 3, effect: { shareRate: 0.1 } },
  { id: "party_radar", name: "파티 레이더", description: "파티원 위치 미니맵 표시", cost: 600, category: "party", maxLevel: 1, effect: { partyRadar: true } },
];
