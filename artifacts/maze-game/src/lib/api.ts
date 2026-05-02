// API 기본 URL 헬퍼 (axios 없이 순수 fetch 기반)
export function getApiBase(): string {
  const base = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${window.location.origin}${base}/api`;
}

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
