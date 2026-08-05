import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  generatePlayerId,
  PLAYER_AVATAR_COLORS,
  type SerializedSpirit,
} from "./socialTypes";

interface PlayerStore {
  /** 临时 UUID */
  playerId: string;
  /** 昵称 */
  nickname: string;
  /** 头像主题色 */
  avatarColor: string;
  /** 设置昵称 */
  setNickname: (nickname: string) => void;
  /** 设置头像色 */
  setAvatarColor: (color: string) => void;
  /** 同时更新昵称与头像色 */
  setProfile: (profile: { nickname?: string; avatarColor?: string }) => void;
  /** 重置身份（生成新 UUID） */
  resetIdentity: () => void;
}

const randomNickname = (): string => {
  const adjectives = [
    "夜行",
    "星海",
    "残月",
    "雷霆",
    "幻影",
    "炽焰",
    "霜雪",
    "苍穹",
  ];
  const nouns = ["契约者", "旅人", "棋手", "守望", "歌者", "行者", "执灯人"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}`;
};

const randomColor = (): string =>
  PLAYER_AVATAR_COLORS[Math.floor(Math.random() * PLAYER_AVATAR_COLORS.length)];

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set) => ({
      playerId: generatePlayerId(),
      nickname: randomNickname(),
      avatarColor: randomColor(),
      setNickname: (nickname) =>
        set({ nickname: nickname.trim().slice(0, 16) || "匿名契约者" }),
      setAvatarColor: (avatarColor) => set({ avatarColor }),
      setProfile: ({ nickname, avatarColor }) =>
        set((state) => ({
          ...(nickname !== undefined
            ? { nickname: nickname.trim().slice(0, 16) || state.nickname }
            : {}),
          ...(avatarColor !== undefined ? { avatarColor } : {}),
        })),
      resetIdentity: () =>
        set({
          playerId: generatePlayerId(),
          nickname: randomNickname(),
          avatarColor: randomColor(),
        }),
    }),
    {
      name: "word-brawl-social-player",
    },
  ),
);

/** 把 RosterCharacter 序列化为社交房间传输所需的快照 */
export const serializeSpirit = (
  char: import("./useRosterStore").RosterCharacter,
): SerializedSpirit => {
  const combatSnapshot = JSON.parse(
    JSON.stringify(char),
  ) as import("./useRosterStore").RosterCharacter;
  // 社交卡片统一使用顶层 imageUrl。战斗快照不重复携带图片和形态历史，
  // 避免房间状态、activeSpirit 与聊天消息多次复制同一份 Data URL。
  combatSnapshot.imageUrl = undefined;
  combatSnapshot.formHistory = [];
  delete combatSnapshot.pendingEvolutionReplay;

  const persona = char.spiritProfile;
  const signatureSkill =
    char.skills.find((skill) => skill.isUltimate || skill.type === "ultimate")
      ?.name ??
    char.skills[0]?.name ??
    char.name;
  const fallbackSlogan = `${char.name}，以${signatureSkill}为誓。`;
  const battleCry =
    persona?.battleCry?.trim() === "此刻，词意成真。"
      ? ""
      : persona?.battleCry?.trim();
  return {
    rosterId: char.rosterId,
    name: char.name,
    imageUrl: char.imageUrl,
    imagePrompt: char.imagePrompt,
    sourceDescription: char.sourceDescription,
    combatSnapshot,
    persona: {
      archetype: persona?.archetype ?? "未知原型",
      temperament: persona?.temperament ?? "未知",
      speechStyle: persona?.speechStyle ?? "平常",
      slogan:
        persona?.slogan?.trim() ||
        battleCry ||
        persona?.catchphrases?.[0]?.trim() ||
        fallbackSlogan,
      catchphrases: persona?.catchphrases ?? [],
      battleCry: persona?.battleCry ?? "",
      victoryLine: persona?.victoryLine ?? "",
      defeatLine: persona?.defeatLine ?? "",
      worldAnchors: persona?.worldAnchors ?? [],
    },
  };
};
