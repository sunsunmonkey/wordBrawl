import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  DoorOpen,
  KeyRound,
  LogIn,
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
  MAX_CARRIED_SPIRITS,
  PLAYER_AVATAR_COLORS,
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
  // 多选词灵：最多 MAX_CARRIED_SPIRITS 个（房主与加入者一致）
  const [selectedRosterIds, setSelectedRosterIds] = useState<string[]>(() =>
    roster.slice(0, 1).map((c) => c.rosterId),
  );
  const [roomCodeInput, setRoomCodeInput] = useState("");

  /** 词灵携带上限（统一为 MAX_CARRIED_SPIRITS，不再区分房间类型） */
  const carryLimit = MAX_CARRIED_SPIRITS;

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

  const buildSpirits = () => selectedRosterList.map((c) => serializeSpirit(c));

  const enterRoom = () => {
    startHeartbeat();
    setPhase("SOCIAL_ROOM");
  };

  const handleCreateRoom = (quickBattle = false) => {
    const trimmed = localNickname.trim();
    if (!trimmed) {
      setError("请先填写昵称");
      return;
    }
    if (selectedRosterList.length === 0) {
      setError("请至少携带 1 位词灵");
      return;
    }
    setProfile({ nickname: trimmed, avatarColor });
    createRoom(buildSpirits(), { quickBattle });
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

      <div className="relative z-10 px-6 md:px-10 lg:px-16 pt-20 pb-12 max-w-[1280px] mx-auto">
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
              带上词灵开房间：每人最多 {MAX_CARRIED_SPIRITS}{" "}
              位词灵。@词灵群聊互动，房内随时发起约战。把链接或房间码发给朋友即可加入。
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
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

              {/* 创建房间 */}
              <section className="relative border border-[#66FCF1]/35 bg-black/30 backdrop-blur-sm p-5">
                <CornerAccents color="#66FCF1" />
                <div className="mb-3 flex items-center gap-2">
                  <span className="w-1 h-1 bg-[#66FCF1]" />
                  <span className="text-[10px] font-mono tracking-[0.35em] text-[#66FCF1]/85">
                    N°02 · CREATE ROOM
                  </span>
                </div>
                <p className="text-xs text-white/45 leading-relaxed mb-3">
                  开一个房间，最多带 {MAX_CARRIED_SPIRITS} 位词灵。群聊 @
                  词灵会回复，房内随时向他人发起约战；也可快速对战，打完继续聊。
                </p>
                {/* 创建按钮 */}
                <button
                  type="button"
                  onClick={() => handleCreateRoom(false)}
                  disabled={!localNickname.trim()}
                  className="group relative w-full flex items-center justify-center gap-2 rounded border-2 border-[#66FCF1] px-4 py-3 text-sm font-black tracking-[0.25em] text-[#66FCF1] transition-all hover:bg-[#66FCF1] hover:text-[#0B0C10] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={15} />
                  创建房间
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </button>
                {/* 快速对战入口 */}
                <button
                  type="button"
                  onClick={() => handleCreateRoom(true)}
                  disabled={!localNickname.trim()}
                  className="group relative mt-2 w-full flex items-center justify-center gap-2 rounded border-2 border-[#FF003C] bg-[#FF003C]/8 px-4 py-2.5 text-xs font-black tracking-[0.2em] text-[#FF003C] transition-all hover:bg-[#FF003C] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Swords size={14} />
                  快速对战
                  <span className="text-[9px] font-normal text-white/50 tracking-normal">
                    对手加入即开战
                  </span>
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
                  输入朋友给的 6 位房间码即可加入。
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
              <CornerAccents color="#FFD700" />
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-[#FFD700]" />
                  <span className="text-[10px] font-mono tracking-[0.35em] text-white/60">
                    CARRY · SPIRITS
                  </span>
                  <span className="text-[9px] font-mono tracking-widest px-1.5 py-0.5 rounded border border-[#66FCF1]/50 text-[#66FCF1]">
                    CHAT
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
                <span className="font-bold text-[#66FCF1]">房间</span> 最多带{" "}
                {carryLimit} 位词灵。群里 @ 它们会回复，房间内可切换。
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[420px] overflow-y-auto scrollbar-thin px-1 py-1">
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
