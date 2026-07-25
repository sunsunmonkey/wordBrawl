import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  DoorOpen,
  KeyRound,
  LogIn,
  MessagesSquare,
  Plus,
  Sparkles,
  Swords,
  Users,
  X,
} from "lucide-react";
import { useGameStore } from "../store/useGameStore";
import {
  isRosterCharacterUnavailable,
  useRosterStore,
  type RosterCharacter,
} from "../store/useRosterStore";
import { usePlayerStore, serializeSpirit } from "../store/usePlayerStore";
import { useSocialStore } from "../store/useSocialStore";
import {
  MAX_BATTLE_CARRIED_SPIRITS,
  MAX_CARRIED_SPIRITS,
  PLAYER_AVATAR_COLORS,
  type SocialRoomMode,
} from "../store/socialTypes";
import { startHeartbeat, stopHeartbeat } from "../store/useSocialStore";
import { BackButton } from "./BackButton";
import { SpiritCard } from "./SpiritCard";
import { CharacterAvatar } from "./CharacterAvatar";

const ROOM_CODE_REGEX = /^[A-Z2-9]{6}$/;

export const SocialLobbyScreen: React.FC = () => {
  const setPhase = useGameStore((s) => s.setPhase);
  const roster = useRosterStore((s) => s.roster);
  const { nickname, avatarColor, setProfile } = usePlayerStore();
  const { createRoom, joinRoom, error, setError } = useSocialStore();

  const [localNickname, setLocalNickname] = useState(nickname);
  // 多选词灵：最多 MAX_CARRIED_SPIRITS 个
  const [selectedRosterIds, setSelectedRosterIds] = useState<string[]>(() =>
    roster.slice(0, 1).map((c) => c.rosterId),
  );
  const [roomCodeInput, setRoomCodeInput] = useState("");
  // 创建房间的模式：群聊房 / 1v1 对战房（决定词灵携带上限）
  const [createMode, setCreateMode] = useState<SocialRoomMode>("chat");

  /** 当前模式下的词灵携带上限 */
  const carryLimit =
    createMode === "battle" ? MAX_BATTLE_CARRIED_SPIRITS : MAX_CARRIED_SPIRITS;

  useEffect(() => {
    setLocalNickname(nickname);
  }, [nickname]);

  useEffect(() => {
    return () => {
      setError("");
    };
  }, [setError]);

  const availableRoster = useMemo(
    () => roster.filter((c) => !isRosterCharacterUnavailable(c)),
    [roster],
  );

  const selectedRosterList = useMemo(
    () =>
      selectedRosterIds
        .map((id) => availableRoster.find((c) => c.rosterId === id))
        .filter((c): c is RosterCharacter => Boolean(c)),
    [selectedRosterIds, availableRoster],
  );

  const toggleSpirit = (rosterId: string) => {
    setSelectedRosterIds((prev) => {
      if (prev.includes(rosterId)) {
        return prev.filter((id) => id !== rosterId);
      }
      if (prev.length >= carryLimit) return prev;
      return [...prev, rosterId];
    });
  };

  /** 切换创建模式，并自动截断已选词灵到新模式上限 */
  const switchCreateMode = (mode: SocialRoomMode) => {
    setCreateMode(mode);
    const limit =
      mode === "battle" ? MAX_BATTLE_CARRIED_SPIRITS : MAX_CARRIED_SPIRITS;
    setSelectedRosterIds((prev) => prev.slice(0, limit));
    setError("");
  };

  const buildSpirits = () => selectedRosterList.map((c) => serializeSpirit(c));

  const enterRoom = () => {
    startHeartbeat();
    setPhase("SOCIAL_ROOM");
  };

  const handleCreateRoom = () => {
    const trimmed = localNickname.trim();
    if (!trimmed) {
      setError("请先填写昵称");
      return;
    }
    if (selectedRosterList.length === 0) {
      setError(
        createMode === "battle"
          ? "1v1 对战需要至少携带 1 位词灵"
          : "请至少携带 1 位词灵",
      );
      return;
    }
    setProfile({ nickname: trimmed, avatarColor });
    createRoom(buildSpirits(), createMode);
    enterRoom();
  };

  const handleJoinRoom = () => {
    const trimmed = localNickname.trim();
    if (!trimmed) {
      setError("请先填写昵称");
      return;
    }
    const code = roomCodeInput.trim().toUpperCase();
    if (!ROOM_CODE_REGEX.test(code)) {
      setError("房间码为 6 位大写字母或数字（不含 0/1/I/O）");
      return;
    }
    setProfile({ nickname: trimmed, avatarColor });
    const ok = joinRoom(code, buildSpirits());
    if (ok) {
      enterRoom();
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#05060a] text-white">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute -top-40 -left-40 w-[55vw] h-[55vw] rounded-full opacity-25"
          style={{
            background:
              "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[55vw] h-[55vw] rounded-full opacity-25"
          style={{
            background:
              "radial-gradient(circle, rgba(102,252,241,0.28) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* 顶部 */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 md:px-10 py-5">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => setPhase("MODE_SELECT")} color="#A78BFA" />
          <div className="hidden md:flex items-center gap-3 ml-2 text-[10px] font-mono tracking-[0.4em] text-white/40">
            <div className="w-6 h-[1px] bg-[#A78BFA]" />
            <span>SOCIAL · LOBBY</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 px-6 md:px-10 lg:px-16 pt-20 pb-12 max-w-[1320px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-[1px] bg-[#A78BFA]" />
              <span className="text-[10px] tracking-[0.5em] text-[#A78BFA]/90 font-mono">
                SOCIAL · & · FRIENDS
              </span>
            </div>
            <h1
              className="font-display font-black leading-[0.9] tracking-tight"
              style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)" }}
            >
              <span className="text-white">社交</span>
              <span
                className="text-[#A78BFA]"
                style={{ textShadow: "0 0 30px rgba(167,139,250,0.55)" }}
              >
                &amp;朋友
              </span>
            </h1>
            <p className="mt-3 text-sm text-white/50 max-w-xl leading-relaxed">
              带上词灵开房间：群聊房最多 {MAX_CARRIED_SPIRITS} 位、1v1
              对战房最多 {MAX_BATTLE_CARRIED_SPIRITS}{" "}
              位。@词灵群聊互动，或开对战房等对手来打。把链接或房间码发给朋友即可加入。
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            {/* 左侧：玩家身份 + 房间操作 */}
            <div className="flex flex-col gap-5">
              {/* 昵称 + 头像色 */}
              <section className="relative border border-[#A78BFA]/30 bg-black/30 backdrop-blur-sm p-5">
                <CornerAccents color="#A78BFA" />
                <div className="mb-3 flex items-center gap-2">
                  <span className="w-1 h-1 bg-[#A78BFA]" />
                  <span className="text-[10px] font-mono tracking-[0.35em] text-[#A78BFA]/85">
                    N°01 · IDENTITY
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div
                    className="relative h-14 w-14 shrink-0 rounded-full border-2 flex items-center justify-center font-black text-lg"
                    style={{
                      borderColor: avatarColor,
                      boxShadow: `0 0 18px ${avatarColor}55`,
                      color: avatarColor,
                      background: `${avatarColor}15`,
                    }}
                  >
                    {localNickname.slice(0, 1).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[9px] font-mono tracking-[0.3em] text-white/40 mb-1">
                      NICKNAME
                    </label>
                    <input
                      type="text"
                      value={localNickname}
                      maxLength={16}
                      onChange={(e) => setLocalNickname(e.target.value)}
                      placeholder="给自己起个名字"
                      className="w-full bg-transparent border-b border-[#A78BFA]/30 focus:border-[#A78BFA] outline-none py-1.5 text-sm font-bold text-white transition-colors"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-[9px] font-mono tracking-[0.3em] text-white/40 mb-2">
                    AVATAR COLOR
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PLAYER_AVATAR_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setProfile({ avatarColor: color })}
                        className="h-7 w-7 rounded-full border-2 transition-all hover:scale-110"
                        style={{
                          backgroundColor: color,
                          borderColor:
                            avatarColor === color ? "#fff" : "transparent",
                          boxShadow:
                            avatarColor === color
                              ? `0 0 12px ${color}`
                              : "none",
                        }}
                        aria-label={`选择颜色 ${color}`}
                      />
                    ))}
                  </div>
                </div>
              </section>

              {/* 创建房间：先选模式，再创建 */}
              <section className="relative border border-[#66FCF1]/35 bg-black/30 backdrop-blur-sm p-5">
                <CornerAccents color="#66FCF1" />
                <div className="mb-3 flex items-center gap-2">
                  <span className="w-1 h-1 bg-[#66FCF1]" />
                  <span className="text-[10px] font-mono tracking-[0.35em] text-[#66FCF1]/85">
                    N°02 · CREATE ROOM
                  </span>
                </div>
                <p className="text-xs text-white/45 leading-relaxed mb-3">
                  选择房间类型，词灵携带上限会跟着切换。
                </p>
                {/* 模式切换 Tab */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => switchCreateMode("chat")}
                    className={`relative flex items-center gap-2 rounded border-2 px-3 py-2.5 text-left transition-all ${
                      createMode === "chat"
                        ? "border-[#66FCF1] bg-[#66FCF1]/12"
                        : "border-white/10 bg-black/40 hover:border-[#66FCF1]/50"
                    }`}
                  >
                    <MessagesSquare
                      size={15}
                      className={
                        createMode === "chat"
                          ? "text-[#66FCF1]"
                          : "text-white/40"
                      }
                    />
                    <div className="min-w-0">
                      <div
                        className={`text-[11px] font-black tracking-[0.2em] ${
                          createMode === "chat"
                            ? "text-[#66FCF1]"
                            : "text-white/50"
                        }`}
                      >
                        群聊房
                      </div>
                      <div className="text-[9px] text-white/40 mt-0.5">
                        最多 {MAX_CARRIED_SPIRITS} 位 · 多人聊天
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchCreateMode("battle")}
                    className={`relative flex items-center gap-2 rounded border-2 px-3 py-2.5 text-left transition-all ${
                      createMode === "battle"
                        ? "border-[#FF003C] bg-[#FF003C]/12"
                        : "border-white/10 bg-black/40 hover:border-[#FF003C]/50"
                    }`}
                  >
                    <Swords
                      size={15}
                      className={
                        createMode === "battle"
                          ? "text-[#FF003C]"
                          : "text-white/40"
                      }
                    />
                    <div className="min-w-0">
                      <div
                        className={`text-[11px] font-black tracking-[0.2em] ${
                          createMode === "battle"
                            ? "text-[#FF003C]"
                            : "text-white/50"
                        }`}
                      >
                        1v1 对战
                      </div>
                      <div className="text-[9px] text-white/40 mt-0.5">
                        最多 {MAX_BATTLE_CARRIED_SPIRITS} 位 · 加入即开战
                      </div>
                    </div>
                  </button>
                </div>
                {/* 当前模式说明 */}
                <div className="mb-3 rounded border border-white/8 bg-black/30 px-3 py-2 text-[10px] leading-relaxed text-white/55">
                  {createMode === "chat" ? (
                    <span>
                      <span className="text-[#66FCF1] font-bold">群聊房：</span>
                      多人聊天 · @词灵 persona 回复 · 房内手动约战
                    </span>
                  ) : (
                    <span>
                      <span className="text-[#FF003C] font-bold">对战房：</span>
                      专用 1v1 · 对手加入自动开战 · 跳过群聊
                    </span>
                  )}
                </div>
                {/* 统一创建按钮 */}
                <button
                  type="button"
                  onClick={handleCreateRoom}
                  disabled={!localNickname.trim()}
                  className={`group relative w-full flex items-center justify-center gap-2 rounded border-2 px-4 py-3 text-sm font-black tracking-[0.25em] transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    createMode === "chat"
                      ? "border-[#66FCF1] text-[#66FCF1] hover:bg-[#66FCF1] hover:text-[#0B0C10]"
                      : "border-[#FF003C] text-[#FF003C] hover:bg-[#FF003C] hover:text-white"
                  }`}
                >
                  <Plus size={15} />
                  创建{createMode === "chat" ? "群聊房" : "1v1 对战房"}
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </button>
                {selectedRosterList.length === 0 && (
                  <div className="mt-2 text-[10px] text-[#FFD700]/70 font-mono tracking-wider">
                    提示：至少携带 1 位词灵才能创建房间
                  </div>
                )}
              </section>

              {/* 加入房间 */}
              <section className="relative border border-[#FFD700]/35 bg-black/30 backdrop-blur-sm p-5">
                <CornerAccents color="#FFD700" />
                <div className="mb-3 flex items-center gap-2">
                  <span className="w-1 h-1 bg-[#FFD700]" />
                  <span className="text-[10px] font-mono tracking-[0.35em] text-[#FFD700]/85">
                    N°03 · JOIN ROOM
                  </span>
                </div>
                <p className="text-xs text-white/45 leading-relaxed mb-3">
                  输入朋友给的 6 位房间码（群聊房 / 对战房均可）。
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomCodeInput}
                    maxLength={6}
                    onChange={(e) =>
                      setRoomCodeInput(e.target.value.toUpperCase())
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleJoinRoom();
                    }}
                    placeholder="K7X2P9"
                    className="flex-1 bg-black/50 border border-[#FFD700]/40 focus:border-[#FFD700] outline-none px-3 py-2.5 text-center text-lg font-black tracking-[0.5em] text-[#FFD700] placeholder:text-white/20 placeholder:tracking-[0.3em] placeholder:font-mono transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleJoinRoom}
                    disabled={!localNickname.trim() || !roomCodeInput.trim()}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded border-2 border-[#FFD700] px-4 text-xs font-black tracking-[0.2em] text-[#FFD700] transition-all hover:bg-[#FFD700] hover:text-[#0B0C10] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#FFD700]"
                  >
                    <LogIn size={14} />
                    加入
                  </button>
                </div>
              </section>

              {error && (
                <div className="rounded border border-[#FF6B9D]/50 bg-[#FF6B9D]/10 px-4 py-2.5 text-xs text-[#FF6B9D] tracking-wide">
                  {error}
                </div>
              )}
            </div>

            {/* 右侧：词灵多选 */}
            <section className="relative border border-white/10 bg-black/30 backdrop-blur-sm p-5 flex flex-col">
              <CornerAccents
                color={createMode === "battle" ? "#FF003C" : "#FFD700"}
              />
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-1 h-1"
                    style={{
                      background:
                        createMode === "battle" ? "#FF003C" : "#FFD700",
                    }}
                  />
                  <span className="text-[10px] font-mono tracking-[0.35em] text-white/60">
                    CARRY · SPIRITS
                  </span>
                  {/* 当前模式徽章 */}
                  <span
                    className={`text-[9px] font-mono tracking-widest px-1.5 py-0.5 rounded border ${
                      createMode === "battle"
                        ? "border-[#FF003C]/50 text-[#FF003C]"
                        : "border-[#66FCF1]/50 text-[#66FCF1]"
                    }`}
                  >
                    {createMode === "battle" ? "1v1" : "CHAT"}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-mono font-bold ${
                    selectedRosterList.length >= carryLimit
                      ? "text-[#FFD700]"
                      : "text-white/50"
                  }`}
                >
                  {selectedRosterList.length} / {carryLimit}
                </span>
              </div>
              <p className="text-xs text-white/45 leading-relaxed mb-4">
                当前模式{" "}
                <span
                  className={`font-bold ${
                    createMode === "battle"
                      ? "text-[#FF003C]"
                      : "text-[#66FCF1]"
                  }`}
                >
                  {createMode === "battle" ? "1v1 对战房" : "群聊房"}
                </span>{" "}
                最多带 {carryLimit} 位词灵。群里 @
                它们会回复；约战时默认用第一位出战，房间内可切换。
              </p>

              {availableRoster.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                  <Users size={36} className="text-white/20 mb-3" />
                  <div className="text-sm text-white/40">
                    麾下还没有可用词灵
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhase("MODE_SELECT")}
                    className="mt-4 text-xs text-[#66FCF1] underline-offset-4 hover:underline"
                  >
                    返回创造一个
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[420px] overflow-y-auto scrollbar-thin px-1 py-1">
                    {availableRoster.map((char) => {
                      const isSelected = selectedRosterIds.includes(
                        char.rosterId,
                      );
                      return (
                        <div key={char.rosterId} className="relative">
                          <SpiritCard
                            character={char}
                            size="sm"
                            selected={isSelected}
                            onClick={() => toggleSpirit(char.rosterId)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleSpirit(char.rosterId);
                              }
                            }}
                          />
                          {isSelected && (
                            <span className="absolute top-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#FFD700] text-[#0B0C10] shadow-[0_0_8px_rgba(255,215,0,0.7)]">
                              <X size={11} className="rotate-45" />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {selectedRosterList.length > 0 && (
                    <SelectedSpiritsPreview spirits={selectedRosterList} />
                  )}
                </>
              )}
            </section>
          </div>

          {/* 底部提示 */}
          <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] font-mono tracking-[0.3em] text-white/25 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <DoorOpen size={12} className="text-[#A78BFA]" />
              <span>同浏览器多 Tab 即可模拟多人</span>
            </div>
            <div className="flex items-center gap-3">
              <KeyRound size={12} className="text-[#FFD700]" />
              <span>房间码 6 位 · 不含 0/1/I/O</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const SelectedSpiritsPreview: React.FC<{ spirits: RosterCharacter[] }> = ({
  spirits,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="mt-4 rounded-lg border border-[#FFD700]/35 bg-[#0B0C10]/70 p-3"
  >
    <div className="mb-2 flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#FFD700]/80">
      <Sparkles size={11} />
      <span>READY · 第一位为出战词灵</span>
    </div>
    <div className="flex flex-wrap gap-2">
      {spirits.map((s, idx) => (
        <div
          key={s.rosterId}
          className="flex items-center gap-2 rounded border border-[#FFD700]/30 bg-black/40 px-2 py-1"
        >
          <div className="h-7 w-7 shrink-0 overflow-hidden rounded border border-[#FFD700]/40">
            <CharacterAvatar
              imageUrl={s.imageUrl}
              name={s.name}
              themeColor="#FFD700"
              className="h-full w-full"
              iconSize={14}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#FFD700] leading-none">
              {idx === 0 ? "出战" : "携带"}
            </span>
            <span className="text-[10px] text-white/70 truncate max-w-[80px]">
              {s.name}
            </span>
          </div>
        </div>
      ))}
    </div>
  </motion.div>
);

const CornerAccents: React.FC<{ color: string }> = ({ color }) => (
  <>
    <span
      aria-hidden
      className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l"
      style={{ borderColor: color }}
    />
    <span
      aria-hidden
      className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r"
      style={{ borderColor: color }}
    />
    <span
      aria-hidden
      className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l"
      style={{ borderColor: color }}
    />
    <span
      aria-hidden
      className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r"
      style={{ borderColor: color }}
    />
  </>
);

// 保留 stopHeartbeat 引用，房间退出时使用
void stopHeartbeat;
