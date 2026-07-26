import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// 平台检测：macOS 与 Windows 字体渲染引擎不同（CoreText vs DirectWrite），
// 在 <html> 上标记 data-os 供 CSS 做平台特定补偿
const platform = (() => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac os")) return "mac";
  if (ua.includes("windows")) return "windows";
  return "other";
})();
document.documentElement.setAttribute("data-os", platform);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
