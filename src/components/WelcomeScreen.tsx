import React, { useState, useEffect } from "react";
import { useGameStore } from "../store/useGameStore";
import { motion } from "framer-motion";
import {
  Key,
  Server,
  Cpu,
  AlertTriangle,
  Gift,
  UsersRound,
  ChevronRight,
} from "lucide-react";
import {
  isRosterCharacterUnavailable,
  useRosterStore,
} from "../store/useRosterStore";
import { useSpiritChatStore } from "../store/useSpiritChatStore";

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
    setBattleMode,
    setTowerRosterId,
    setTowerLayer,
  } = useGameStore();
  const [inputKey, setInputKey] = useState(apiKey);
  const [inputBaseUrl, setInputBaseUrl] = useState(baseUrl);
  const [inputModel, setInputModel] = useState(model);
  const [error, setError] = useState("");
  const [freeUsage, setFreeUsage] = useState<FreeUsageStatus | null>(null);
  const [isUsageLoading, setIsUsageLoading] = useState(true);
  const roster = useRosterStore((s) => s.roster);
  const rosterCount = roster.length;
  const setOpenSpiritRosterId = useSpiritChatStore((s) => s.setOpenRosterId);

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
    ? "∞"
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

  // pill 快捷入口：如果没配置就自动切到免费模式，然后跳目标页
  const availableRoster = roster.filter(
    (char) => !isRosterCharacterUnavailable(char),
  );
  const firstAvailable = availableRoster[0] ?? null;

  const goShortcut = (
    target: "summon" | "chat" | "story" | "social" | "tower",
  ) => {
    if (apiMode === "custom" && !(apiKey && baseUrl && model)) {
      setApiMode("free");
    }
    setError("");

    if (target === "summon") {
      setPhase("RECRUIT_CREATE");
      return;
    }
    if (target === "story") {
      if (availableRoster.length < 2) {
        setPhase("MODE_SELECT");
        return;
      }
      setPhase("SPIRIT_STORY");
      return;
    }
    if (target === "chat") {
      if (!firstAvailable) {
        setPhase("MODE_SELECT");
        return;
      }
      setOpenSpiritRosterId(firstAvailable.rosterId);
      setPhase("SPIRIT_CHAT");
      return;
    }
    if (target === "social") {
      setPhase("SOCIAL_LOBBY");
      return;
    }
    if (target === "tower") {
      if (!firstAvailable) {
        setPhase("MODE_SELECT");
        return;
      }
      setBattleMode("pve_tower");
      setTowerRosterId(firstAvailable.rosterId);
      setTowerLayer(firstAvailable.tower.nextLayer ?? 1);
      setPhase("TOWER_HUB");
      return;
    }
  };

  const chatDisabled = !firstAvailable;
  const storyDisabled = availableRoster.length < 2;
  const towerDisabled = !firstAvailable;

  const inputBaseClass =
    "w-full bg-transparent border-b border-white/15 py-2.5 text-white text-sm focus:outline-none focus:border-[#66FCF1] transition-colors placeholder:text-white/25";

  const configReady = apiMode === "free" || (apiKey && baseUrl && model);

  return (
    <div className="welcome-screen min-h-screen lg:h-dvh lg:min-h-0 relative overflow-hidden bg-[#05060a] text-white">
      {/* 背景层：静态巨型渐变 + 微妙网格 */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {/* 冷暖对角光晕 */}
        <div
          className="absolute -top-40 -left-40 w-[60vw] h-[60vw] rounded-full opacity-40"
          style={{
            background:
              "radial-gradient(circle, rgba(102,252,241,0.35) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[60vw] h-[60vw] rounded-full opacity-40"
          style={{
            background:
              "radial-gradient(circle, rgba(255,0,96,0.25) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
        {/* 精细网格 */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(102,252,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(102,252,241,1) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          }}
        />
        {/* 顶部/底部渐隐 */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/90 to-transparent" />
      </div>

      {/* 巨型品牌水印 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-start overflow-hidden select-none"
      >
        <div
          className="font-display font-black leading-none tracking-tighter text-white/[0.015] pl-[6%]"
          style={{
            fontSize: "min(52vw, 780px)",
            letterSpacing: "-0.08em",
          }}
        >
          词
        </div>
      </div>

      {/* 顶部 HUD */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 md:px-12 py-5 text-[10px] tracking-[0.4em]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-[2px] bg-[#66FCF1]" />
          <span className="text-[#66FCF1]/80">WORD-SPIRIT / 001</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2 text-white/40">
            <span>SYS</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                configReady ? "bg-[#66FCF1]" : "bg-[#FF3860]"
              }`}
              style={{
                boxShadow: `0 0 8px ${configReady ? "#66FCF1" : "#FF3860"}`,
              }}
            />
            <span className={configReady ? "text-[#66FCF1]" : "text-[#FF3860]"}>
              {configReady ? "READY" : "STANDBY"}
            </span>
          </div>
          <span className="text-white/30">v1.0 // WORD-SPIRIT WORLD</span>
        </div>
      </div>

      {/* 主内容：左 hero + 右面板 */}
      <div className="welcome-screen__content relative z-10 min-h-screen lg:min-h-0 lg:h-full flex flex-col">
        <div className="welcome-screen__main min-h-0 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center px-6 md:px-12 lg:px-20 pt-24 pb-16">
          {/* 左：Hero */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
            className="lg:col-span-7 relative"
          >
            {/* Eyebrow */}
            <div className="welcome-screen__eyebrow flex items-center gap-3 mb-6">
              <div className="w-10 h-[1px] bg-[#66FCF1]" />
              <span className="text-[10px] tracking-[0.5em] text-[#66FCF1]/90 font-mono">
                CHAPTER · 00
              </span>
            </div>

            {/* 巨型品牌 */}
            <h1
              className="font-display font-black leading-[0.85] tracking-tight flex items-baseline gap-4 md:gap-6 flex-wrap"
              style={{
                fontSize: "clamp(4rem, 10vw, 9rem)",
                letterSpacing: "-0.04em",
              }}
            >
              <span
                className="text-white"
                style={{
                  textShadow:
                    "0 0 40px rgba(102,252,241,0.35), 0 0 80px rgba(102,252,241,0.15)",
                }}
              >
                词灵
              </span>
              <span
                className="text-[#66FCF1]"
                style={{
                  textShadow:
                    "0 0 30px rgba(102,252,241,0.55), 0 0 90px rgba(102,252,241,0.25)",
                }}
              >
                世界
              </span>
            </h1>

            {/* 描述 */}
            <p className="welcome-screen__description mt-8 max-w-xl text-base md:text-lg text-white/65 leading-relaxed font-light">
              万千意志于此苏醒，而你的传奇，正待降临。
            </p>

            {/* 核心玩法 - 极简数字标签，可点击直接进入免费模式 */}
            <div className="welcome-screen__features mt-10 grid grid-cols-2 md:grid-cols-3 gap-x-10 gap-y-6 max-w-2xl">
              <FeaturePill
                index="01"
                label="召唤词灵"
                accent="#66FCF1"
                onClick={() => goShortcut("summon")}
              />
              <FeaturePill
                index="02"
                label="词灵陪伴"
                accent="#38BDF8"
                onClick={() => goShortcut("chat")}
                disabled={chatDisabled}
                hint={chatDisabled ? "先召唤一位词灵" : undefined}
              />
              <FeaturePill
                index="03"
                label="群像共叙"
                accent="#B78BFF"
                onClick={() => goShortcut("story")}
                disabled={storyDisabled}
                hint={storyDisabled ? "至少需要 2 位词灵" : undefined}
              />
              <FeaturePill
                index="04"
                label="社交&朋友"
                accent="#FBBF24"
                onClick={() => goShortcut("social")}
              />
              <FeaturePill
                index="05"
                label="九层进化"
                accent="#FF6B9D"
                onClick={() => goShortcut("tower")}
                disabled={towerDisabled}
                hint={towerDisabled ? "先召唤一位词灵" : undefined}
              />
            </div>
          </motion.div>

          {/* 右：动作面板 */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="lg:col-span-5 relative"
          >
            <div className="relative">
              {/* 边角刻线装饰 */}
              <CornerCut position="tl" />
              <CornerCut position="tr" />
              <CornerCut position="bl" />
              <CornerCut position="br" />

              <div className="welcome-screen__panel relative bg-black/40 backdrop-blur-md border border-white/10 p-8">
                {/* 面板标题条 */}
                <div className="welcome-screen__panel-header flex items-center justify-between mb-6 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-[#66FCF1]" />
                    <span className="text-[10px] font-mono tracking-[0.35em] text-white/60">
                      ACCESS · TERMINAL
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-white/25">
                    //INIT
                  </span>
                </div>

                {/* 模式选择 */}
                <div className="welcome-screen__mode mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] tracking-[0.3em] text-white/50 font-mono">
                      AI · MODE
                    </span>
                    <span className="text-[10px] font-mono text-white/30">
                      REQUIRED
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-0 border border-white/10">
                    <ModeToggle
                      active={apiMode === "free"}
                      onClick={() => {
                        setApiMode("free");
                        setError("");
                      }}
                      icon={<Gift size={16} />}
                      label="FREE"
                      sub={
                        freeUsage?.unlimited
                          ? "免费体验"
                          : `免费体验 · ${freeUsageLabel}`
                      }
                      accent="#66FCF1"
                    />
                    <ModeToggle
                      active={apiMode === "custom"}
                      onClick={() => {
                        setApiMode("custom");
                        setError("");
                      }}
                      icon={<Key size={16} />}
                      label="CUSTOM"
                      sub="自带 API"
                      accent="#FFD700"
                    />
                  </div>
                </div>

                {apiMode === "custom" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="overflow-hidden"
                  >
                    <FieldRow icon={<Server size={12} />} label="BASE URL">
                      <input
                        type="text"
                        value={inputBaseUrl}
                        onChange={(e) => setInputBaseUrl(e.target.value)}
                        className={inputBaseClass}
                      />
                    </FieldRow>
                    <FieldRow icon={<Cpu size={12} />} label="MODEL">
                      <input
                        type="text"
                        value={inputModel}
                        onChange={(e) => setInputModel(e.target.value)}
                        className={inputBaseClass}
                      />
                    </FieldRow>
                    <FieldRow icon={<Key size={12} />} label="API KEY">
                      <input
                        type="password"
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        placeholder="sk-..."
                        className={inputBaseClass}
                      />
                    </FieldRow>
                    <p className="text-[10px] text-white/30 tracking-wide mb-6">
                      使用 OpenAI 兼容格式
                    </p>
                  </motion.div>
                )}

                {error && (
                  <div className="mb-4 px-3 py-2 bg-[#FF3860]/10 border-l-2 border-[#FF3860] text-[#FF3860] text-xs flex items-center gap-2">
                    <AlertTriangle size={12} /> {error}
                  </div>
                )}

                {/* 主 CTA */}
                <motion.button
                  onClick={handleStart}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="welcome-screen__cta group relative w-full mt-2 flex items-center justify-between px-6 py-5 bg-[#66FCF1] text-black font-black tracking-[0.3em] font-display overflow-hidden"
                  style={{
                    boxShadow:
                      "0 0 30px rgba(102,252,241,0.4), 0 0 60px rgba(102,252,241,0.15)",
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-white translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500"
                  />
                  <span className="relative flex items-center gap-3">
                    <span className="w-2 h-2 bg-black" />
                    进入世界 · 开始游戏
                  </span>
                  <ChevronRight
                    size={20}
                    className="relative group-hover:translate-x-1 transition-transform"
                  />
                </motion.button>

                {/* 次级动作 */}
                <button
                  type="button"
                  onClick={() => setPhase("ROSTER_VIEW")}
                  className="welcome-screen__secondary group mt-3 w-full flex items-center justify-between px-6 py-3.5 border border-white/15 text-white/60 hover:text-white hover:border-white/30 text-xs font-mono tracking-[0.3em] transition-all"
                >
                  <span className="flex items-center gap-3">
                    <UsersRound size={14} />
                    麾下
                  </span>
                  <span className="text-white/40 group-hover:text-[#66FCF1] transition-colors">
                    {String(rosterCount).padStart(2, "0")}
                  </span>
                </button>
              </div>
            </div>

            {/* 面板下方元数据 */}
            <div className="welcome-screen__metadata mt-4 flex items-center justify-between text-[9px] font-mono tracking-widest text-white/25">
              <span>◤ ACCESS · 001</span>
              <span
                className={
                  configReady ? "text-[#66FCF1]/70" : "text-[#FF3860]/70"
                }
              >
                {configReady ? "READY_TO_SUMMON" : "AWAITING_CONFIG"}
              </span>
              <span>ROSTER · {String(rosterCount).padStart(2, "0")} ◥</span>
            </div>
          </motion.div>
        </div>

        {/* 底部：极简进度式指示 */}
        <div className="welcome-screen__footer relative z-10 border-t border-white/5 px-6 md:px-12 lg:px-20 py-4 flex items-center justify-between text-[10px] font-mono tracking-[0.3em] text-white/30">
          <div className="flex items-center gap-4">
            <span className={configReady ? "text-[#66FCF1]" : ""}>
              01 · CONFIG
            </span>
            <span className="w-10 h-[1px] bg-white/15" />
            <span>02 · SUMMON</span>
            <span className="w-10 h-[1px] bg-white/10" />
            <span>03 · ASCEND</span>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <span>WORD-SPIRIT ENGINE</span>
            <span className="w-1 h-1 bg-[#66FCF1] rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
};

const CornerCut: React.FC<{ position: "tl" | "tr" | "bl" | "br" }> = ({
  position,
}) => {
  const positions: Record<string, string> = {
    tl: "top-0 left-0 border-t border-l",
    tr: "top-0 right-0 border-t border-r",
    bl: "bottom-0 left-0 border-b border-l",
    br: "bottom-0 right-0 border-b border-r",
  };
  return (
    <span
      aria-hidden
      className={`absolute w-4 h-4 border-[#66FCF1] pointer-events-none ${positions[position]}`}
    />
  );
};

const FeaturePill: React.FC<{
  index: string;
  label: string;
  accent?: string;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
}> = ({ index, label, accent = "#66FCF1", onClick, disabled, hint }) => {
  const isInteractive = Boolean(onClick);
  const Comp: keyof JSX.IntrinsicElements = isInteractive ? "button" : "div";
  return (
    <Comp
      {...(isInteractive
        ? {
            type: "button",
            onClick,
            disabled,
            title: hint || label,
            "aria-label": label,
          }
        : {})}
      className={`group relative text-left transition-all ${
        isInteractive
          ? disabled
            ? "opacity-40 cursor-not-allowed"
            : "cursor-pointer hover:-translate-y-0.5"
          : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[10px] font-mono tracking-widest"
          style={{ color: accent }}
        >
          {index}
        </span>
        <span
          className="h-[1px] flex-1 max-w-[32px] transition-all group-hover:max-w-[64px]"
          style={{ background: accent, opacity: 0.7 }}
        />
        {isInteractive && !disabled && (
          <ChevronRight
            size={12}
            className="ml-auto opacity-0 -translate-x-1 transition-all group-hover:opacity-70 group-hover:translate-x-0"
            style={{ color: accent }}
          />
        )}
      </div>
      <div
        className="text-sm md:text-base font-bold tracking-wide transition-colors"
        style={{ color: disabled ? "rgba(255,255,255,0.5)" : "#fff" }}
      >
        {label}
      </div>
      {hint && disabled && (
        <div className="text-[10px] text-white/30 mt-1 tracking-wide">
          {hint}
        </div>
      )}
    </Comp>
  );
};

const ModeToggle: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
  accent: string;
}> = ({ active, onClick, icon, label, sub, accent }) => (
  <button
    type="button"
    onClick={onClick}
    className="welcome-screen__mode-toggle relative flex flex-col items-start gap-1.5 px-4 py-4 text-left transition-all"
    style={{
      background: active ? `${accent}15` : "transparent",
      color: active ? accent : "rgba(255,255,255,0.5)",
    }}
  >
    {active && (
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 0 1px ${accent}, 0 0 20px ${accent}55`,
        }}
      />
    )}
    <div className="flex items-center gap-2 w-full">
      <span>{icon}</span>
      <span className="text-xs font-black tracking-[0.25em]">{label}</span>
    </div>
    <span className="text-[10px] tracking-wide opacity-60">{sub}</span>
  </button>
);

const FieldRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}> = ({ icon, label, children }) => (
  <div className="welcome-screen__field mb-4">
    <div className="flex items-center gap-2 text-[10px] text-white/40 tracking-[0.3em] mb-1 font-mono">
      <span className="text-[#66FCF1]">{icon}</span>
      {label}
    </div>
    {children}
  </div>
);
