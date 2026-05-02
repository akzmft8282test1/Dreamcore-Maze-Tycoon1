// 인증 컨텍스트: JWT 토큰 관리 및 사용자 상태
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

interface User {
  id: number;
  username: string;
  nickname: string;
  role: string;
  currency: number;
  equippedSkin?: string | null;
  isBanned: boolean;
  totalScore: number;
  playtime: number;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
  isAdmin: boolean;
  isMaster: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
  isAdmin: false,
  isMaster: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: !!token,
      retry: false,
    },
  });

  const login = useCallback((newToken: string) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }, [queryClient]);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  // 토큰이 없어지면 user 캐시도 초기화
  useEffect(() => {
    if (!token) {
      queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
    }
  }, [token, queryClient]);

  const isAdmin = user?.role === "admin" || user?.role === "master";
  const isMaster = user?.role === "master";

  return (
    <AuthContext.Provider value={{
      user: user ?? null,
      token,
      isLoading: !!token && isLoading,
      login,
      logout,
      isAdmin,
      isMaster,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
