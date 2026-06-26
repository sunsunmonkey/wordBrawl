import React, { useState, useEffect } from "react";
import { useGameStore } from "../store/useGameStore";
import { motion } from "framer-motion";
import {
  Key,
  Play,
  Server,
  Cpu,
  Zap,
  AlertTriangle,
  Gift,
  UsersRound,
} from "lucide-react";
import { ParticleField } from "./ParticleField";
import { useRosterStore } from "../store/useRosterStore";

interface FreeUsageStatus {
  limit: number;
  used: number;
  remaining: number | null;
  unlimited: boolean;
}

export const WelcomeScreen: React.FC = () => {
  const {
    apiKey,
    baseUrl,
    model,
    apiMode,
    setApiKey,
    setBaseUrl,
    setModel,
    setApiMode,
    setPhase,
  } = useGameStore();
  const [inputKey, setInputKey] = useState(apiKey);
  const [inputBaseUrl, setInputBaseUrl] = useState(baseUrl);
  const [inputModel, setInputModel] = useState(model);
  const [error, setError] = useState("");
  const [freeUsage, setFreeUsage] = useState<FreeUsageStatus | null>(null);
  const [isUsageLoading, setIsUsageLoading] = useState(true);
  const rosterCount = useRosterStore((s) => s.roster.length);

  // 同步持久化的配置到输入框（处理 hydrate 时序问题）
  useEffect(() => {
    setInputKey(apiKey);
    setInputBaseUrl(baseUrl);
    setInputModel(model);
  }, [apiKey, baseUrl, model]);

  useEffect(() => {
    let cancelled = false;

    const loadUsage = async () => {
      setIsUsageLoading(true);
      try {
        const response = await fetch("/api/generate-character");
        const payload = await response.json();
        if (!cancelled && response.ok && payload?.usage) {
          setFreeUsage(payload.usage);
        }
      } catch {
        if (!cancelled) setFreeUsage(null);
      } finally {
        if (!cancelled) setIsUsageLoading(false);
      }
    };

    loadUsage();

    return () => {
      cancelled = true;
    };
  }, []);

  const freeUsageLabel = freeUsage?.unlimited
    ? "♾️"
    : freeUsage
      ? `${freeUsage.remaining}/${freeUsage.limit}`
      : isUsageLoading
        ? "..."
        : "--";

  const handleStart = () => {
    const k = inputKey.trim();
    const u = inputBaseUrl.trim();
    const m = inputModel.trim();
    if (apiMode === "custom" && (!k || !u || !m)) {
      setError("请完整填写 API Key、Base URL 与 Model");
      return;
    }
    setError("");
    if (apiMode === "custom") {
      setApiKey(k);
      setBaseUrl(u);
      setModel(m);
    }
    setPhase("MODE_SELECT");
  };

  const inputBaseClass =
    "w-full bg-[#0B0C10]/80 border border-[#45A29E]/50 rounded p-2.5 text-[#C5C6C7] text-sm focus:outline-none focus:border-[#66FCF1] focus:ring-1 focus:ring-[#66FCF1] transition-all placeholder:text-[#1F2833]/80";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden grid-bg">
      <ParticleField count={40} />

      <div className="absolute inset-0 z-0 opacity-30 pointer-events-none">
        <motion.div
          animate={{ x: [0, 50, 0], y: [0, -30, 0] }}
          transition={{ duration: 12, repeat: Infinity }}
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#66FCF1] rounded-full blur-[140px]"
        />
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
          transition={{ duration: 10, repeat: Infinity }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#FF003C] rounded-full blur-[140px]"
        />
      </div>

      <div className="absolute top-6 left-6 text-xs text-[#66FCF1]/60 z-10">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#66FCF1] animate-pulse" />
          SYSTEM ONLINE
        </div>
        <div className="text-[10px] text-[#8a8d91]/60 mt-1">
          v1.0.0 · BYTE-ARENA
        </div>
      </div>
      <div className="absolute top-6 right-6 text-xs text-[#FF003C]/60 z-10 text-right">
        <div className="flex items-center justify-end gap-2">
          {apiMode === "free"
            ? "FREE TRIAL READY"
            : apiKey && baseUrl && model
              ? "CONFIG READY"
              : "CONFIG REQUIRED"}
        </div>
        <div className="text-[10px] text-[#8a8d91]/60 mt-1">
          {apiMode === "free"
            ? "server powered"
            : model
              ? model.slice(0, 22)
              : "— no model —"}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="z-10 flex flex-col items-center max-w-md w-full gap-8 crt-flicker"
      >
        <div className="text-center relative">
          <motion.div
            animate={{ rotate: [0, 3, -3, 0], scale: [1, 1.05, 1] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="flex justify-center mb-6"
          >
            <div className="relative">
              <img
                src="/logo.png"
                alt="Word Brawl"
                className="w-40 h-40 md:w-52 md:h-52 object-contain drop-shadow-[0_0_20px_rgba(102,252,241,0.6)]"
              />
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  background: 'radial-gradient(circle, rgba(102,252,241,0.2) 0%, transparent 70%)',
                }}
              />
            </div>
          </motion.div>
          <h1
            data-text="言出法随"
            className="text-6xl md:text-7xl font-black tracking-wider mb-2 glitch-text font-display"
            style={{
              color: "#66FCF1",
              textShadow: "0 0 18px #66FCF1, 0 0 40px rgba(102, 252, 241, 0.4)",
            }}
          >
            言出法随
          </h1>
          <p className="text-xl font-bold tracking-[0.3em] text-[#C5C6C7] uppercase mt-2 text-glow-cyan">
            Word · Brawl
          </p>
          <div className="flex items-center justify-center gap-2 mt-3 text-xs text-[#8a8d91]">
            <Zap size={12} className="text-yellow-400" />
            描述角色 · AI 生成 · 自动对战
            <Zap size={12} className="text-yellow-400" />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="w-full bg-[#1F2833]/70 backdrop-blur-md p-6 rounded-lg border border-[#45A29E]/40 relative corner-frame text-[#66FCF1]"
          style={{
            boxShadow:
              "0 0 30px rgba(69, 162, 158, 0.15), inset 0 0 30px rgba(69, 162, 158, 0.05)",
          }}
        >
          <div className="mb-4">
            <label className="flex items-center gap-2 text-xs text-[#66FCF1] mb-2 font-semibold tracking-wider">
              <Zap size={14} />
              AI MODE
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setApiMode("free");
                  setError("");
                }}
                className={`relative flex flex-col items-center gap-1 p-3 rounded border-2 transition-all ${
                  apiMode === "free"
                    ? "border-[#66FCF1] bg-[#66FCF1]/10 text-[#66FCF1]"
                    : "border-[#45A29E]/30 text-[#8a8d91] hover:border-[#66FCF1]/50"
                }`}
                style={
                  apiMode === "free"
                    ? { boxShadow: "0 0 12px rgba(102,252,241,0.4)" }
                    : {}
                }
              >
                <Gift size={20} />
                <span className="text-xs font-bold tracking-wider">FREE</span>
                <span className="text-[9px] opacity-70">
                  每日生成体验 ({freeUsageLabel})
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setApiMode("custom");
                  setError("");
                }}
                className={`relative flex flex-col items-center gap-1 p-3 rounded border-2 transition-all ${
                  apiMode === "custom"
                    ? "border-[#FFD700] bg-[#FFD700]/10 text-[#FFD700]"
                    : "border-[#45A29E]/30 text-[#8a8d91] hover:border-[#FFD700]/50"
                }`}
                style={
                  apiMode === "custom"
                    ? { boxShadow: "0 0 12px rgba(255,215,0,0.4)" }
                    : {}
                }
              >
                <Key size={20} />
                <span className="text-xs font-bold tracking-wider">CUSTOM</span>
                <span className="text-[9px] opacity-70">自带 API</span>
              </button>
            </div>
          </div>

          {apiMode === "custom" && (
            <>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-xs text-[#66FCF1] mb-2 font-semibold tracking-wider">
                  <Server size={14} />
                  BASE URL
                </label>
                <input
                  type="text"
                  value={inputBaseUrl}
                  onChange={(e) => setInputBaseUrl(e.target.value)}
                  placeholder=""
                  className={inputBaseClass}
                />
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2 text-xs text-[#66FCF1] mb-2 font-semibold tracking-wider">
                  <Cpu size={14} />
                  MODEL
                </label>
                <input
                  type="text"
                  value={inputModel}
                  onChange={(e) => setInputModel(e.target.value)}
                  placeholder=""
                  className={inputBaseClass}
                />
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2 text-xs text-[#66FCF1] mb-2 font-semibold tracking-wider">
                  <Key size={14} />
                  API KEY
                </label>
                <input
                  type="password"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="sk-..."
                  className={inputBaseClass}
                />
                <p className="text-xs text-[#8a8d91] mt-2 leading-relaxed">
                  <span className="text-[#66FCF1]">▸</span> 请使用 OpenAI api
                  格式
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 p-2.5 bg-red-900/30 border border-red-500/50 text-red-400 rounded text-xs flex items-center gap-2">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <motion.button
            onClick={handleStart}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full group relative flex items-center justify-center gap-2 bg-transparent border-2 border-[#66FCF1] text-[#66FCF1] font-black py-4 px-6 rounded overflow-hidden transition-all hover:bg-[#66FCF1] hover:text-[#0B0C10] glitch-hover tracking-[0.3em] font-display"
            style={{ boxShadow: "0 0 12px rgba(102, 252, 241, 0.5)" }}
          >
            <Play size={20} className="group-hover:fill-current" />
            ENTER ARENA
          </motion.button>

          <button
            type="button"
            onClick={() => setPhase('ROSTER_VIEW')}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-[#0B0C10]/60 border border-[#45A29E]/40 text-[#8a8d91] hover:text-[#66FCF1] hover:border-[#66FCF1]/60 py-2.5 px-4 rounded text-xs font-display tracking-[0.3em] transition-all"
          >
            <UsersRound size={14} />
            我的麾下
            <span className="text-[10px] opacity-70">({rosterCount})</span>
          </button>
        </motion.div>
      </motion.div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-[#8a8d91]/50 z-10 tracking-widest">
        ▼ NEURAL COMBAT ENGINE ▼ FREE TRIAL / BRING YOUR OWN KEY ▼
      </div>
    </div>
  );
};
