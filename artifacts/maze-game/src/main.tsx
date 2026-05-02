import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// 항상 다크 모드 (드림코어 테마)
document.documentElement.classList.add("dark");

// 모든 API 요청에 localStorage의 JWT 토큰을 Authorization 헤더로 자동 첨부
setAuthTokenGetter(() => localStorage.getItem("token"));

createRoot(document.getElementById("root")!).render(<App />);
