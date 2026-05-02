import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// 항상 다크 모드 (드림코어 테마)
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
