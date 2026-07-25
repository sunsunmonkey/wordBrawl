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
  const adjectives = ["夜行", "星海", "残月", "雷霆", "幻影", "炽焰", "霜雪", "苍穹"];
  const nouns = ["契约者", "旅人", "棋手", "守望", "歌者", "行者", "执灯人"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}`;
};

const randomColor = (): string =>
  PLAYER_AVATAR_COLORS[
    Math.floor(Math.random() * PLAYER_AVATAR_COLORS.length)
  ];

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set) => ({
      playerId: generatePlayerId(),
      nickname: randomNickname(),
      avatarColor: randomColor(),
      setNickname: (nickname) => set({ nickname: nickname.trim().slice(0, 16) || "匿名契约者" }),
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
  const persona = char.spiritProfile;
  return {
    rosterId: char.rosterId,
    name: char.name,
    imageUrl: char.imageUrl,
    imagePrompt: char.imagePrompt,
    sourceDescription: char.sourceDescription,
    combatSnapshot: JSON.parse(JSON.stringify(char)) as typeof char,
    persona: {
      archetype: persona?.archetype ?? "未知原型",
      temperament: persona?.temperament ?? "未知",
      speechStyle: persona?.speechStyle ?? "平常",
      catchphrases: persona?.catchphrases ?? [],
      battleCry: persona?.battleCry ?? "",
      victoryLine: persona?.victoryLine ?? "",
      defeatLine: persona?.defeatLine ?? "",
      worldAnchors: persona?.worldAnchors ?? [],
    },
  };
};
