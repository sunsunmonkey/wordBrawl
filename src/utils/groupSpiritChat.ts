import OpenAI from "openai";
import type { AIConfig } from "./ai";
import type { SerializedSpirit, SocialChatMessage } from "../store/socialTypes";
import {
  extractPartialStringFieldWithStatus,
  looksLikeJsonStart,
} from "./jsonStream";

const stripJsonFences = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
};

const parseJsonLoose = (raw: string): unknown => {
  const cleaned = stripJsonFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 返回的内容不是合法 JSON");
    return JSON.parse(match[0]);
  }
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const normalizeReply = (value: unknown): string => {
  const text = String(value || "").trim();
  return (text || "……我听见了。").slice(0, 240);
};

const SYSTEM_PROMPT = `你是《词灵世界》里的一个"词灵"，现在正和你的契约者以及其他玩家一起待在一个群聊房间里。
你必须以角色本人第一人称回应，保留角色性格、口癖和世界观锚点。

群聊场景规则：
- 你是被玩家 @ 才会发言，回复要简短有力（1-3 句，最多不超过 80 字）。
- 你的发言要贴合自己的 persona：原型、性格、说话方式、口头禅、世界观锚点。
- 你可以回应 @ 你的玩家，也可以顺带评价群里其他玩家或他们的词灵（保持性格）。
- 不要自称 AI，不要跳出游戏世界，不要解释你在根据 prompt 回答。
- 不要无脑附和，可以吐槽、反驳、调侃，保持角色锋芒。
- 如果群里聊到了战斗话题，你可以表达战意，但不要主动发起战斗（战斗由玩家约战触发）。
- 不要修改数值、不要承诺系统未实现的效果。
- 不要重复别人刚说过的话，不要长篇大论。
- recentMessages 是当前房间刚刚发生的连续对话，不包含战报或约战状态；必须结合上文理解代词、话题和其他人的发言。triggerMessage 是本次 @ 你的最新消息。

你必须返回合法 JSON，不能包含 markdown、注释或额外文字：
{
  "reply": "你的发言。中文，1-3 句，简短有力，贴合 persona。"
}`;

export interface GroupSpiritChatContext {
  /** 房间码 */
  roomCode: string;
  /** 房间内玩家数 */
  playerCount: number;
  /** 房间内所有词灵的昵称列表 */
  spiritsInRoom: string[];
  /** 最近若干条群聊消息（最多 20 条，含本次 @ 消息） */
  recentMessages: SocialChatMessage[];
}

export interface GroupSpiritChatHandlers {
  onReplyChunk?: (partialReply: string) => void;
}

const LEGACY_BATTLE_SYSTEM_MESSAGE = /发起约战|接受了约战|拒绝了约战/;

const canEnterAiContext = (message: SocialChatMessage): boolean =>
  message.type !== "battle_report" &&
  !message.excludeFromAiContext &&
  !(
    message.type === "system" &&
    LEGACY_BATTLE_SYSTEM_MESSAGE.test(message.content)
  );

/**
 * 请求群聊场景下的词灵回复
 *
 * @param cfg AI 配置
 * @param spirit 被触发的词灵快照
 * @param triggerMessage 玩家 @ 词灵时发送的原文（去掉 @ 前缀）
 * @param context 群聊上下文
 * @param handlers 流式回调
 */
export async function requestGroupSpiritChat(
  cfg: AIConfig,
  spirit: SerializedSpirit,
  triggerMessage: string,
  context: GroupSpiritChatContext,
  handlers?: GroupSpiritChatHandlers,
): Promise<string> {
  const payload = {
    spirit: {
      name: spirit.name,
      archetype: spirit.persona.archetype,
      temperament: spirit.persona.temperament,
      speechStyle: spirit.persona.speechStyle,
      slogan: spirit.persona.slogan,
      catchphrases: spirit.persona.catchphrases,
      worldAnchors: spirit.persona.worldAnchors,
    },
    roomContext: {
      roomCode: context.roomCode,
      playerCount: context.playerCount,
      spiritsInRoom: context.spiritsInRoom,
    },
    triggerMessage,
    recentMessages: context.recentMessages
      .filter(canEnterAiContext)
      .slice(-20)
      .map((m) => ({
        from: m.senderName,
        type: m.type,
        content: m.content.slice(0, 200),
      })),
  };

  const apiMode = cfg.apiMode || "custom";
  if (apiMode === "free") {
    return requestGroupChatFreeTrial(payload, handlers);
  }

  if (!cfg.apiKey) throw new Error("请先填写 API Key");
  if (!cfg.baseUrl) throw new Error("请先填写 Base URL");
  if (!cfg.model) throw new Error("请先填写 Model");

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    dangerouslyAllowBrowser: true,
  });

  const stream = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.92,
    stream: true,
  });

  let rawContent = "";
  let lastEmitted = "";
  const onReplyChunk = handlers?.onReplyChunk;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    rawContent += delta;
    if (!onReplyChunk) continue;

    if (looksLikeJsonStart(rawContent)) {
      const { value } = extractPartialStringFieldWithStatus(
        rawContent,
        "reply",
      );
      if (value && value !== lastEmitted) {
        lastEmitted = value;
        onReplyChunk(value);
      }
    } else {
      const partial = rawContent.trim();
      if (partial && partial !== lastEmitted) {
        lastEmitted = partial;
        onReplyChunk(partial);
      }
    }
  }

  if (!rawContent) throw new Error("词灵没有回应，请稍后再试。");
  try {
    const parsed = parseJsonLoose(rawContent) as Record<string, unknown>;
    return normalizeReply(parsed.reply);
  } catch {
    return rawContent.trim().slice(0, 240) || "……";
  }
}

async function requestGroupChatFreeTrial(
  payload: Record<string, unknown>,
  handlers?: GroupSpiritChatHandlers,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/group-spirit-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("词灵群聊免费接口暂时不可用，请稍后再试。");
  }

  if (
    response.ok &&
    response.body &&
    (response.headers.get("content-type") || "").includes(
      "application/x-ndjson",
    )
  ) {
    return consumeGroupChatStream(response, handlers);
  }

  const raw = await response.json().catch(() => ({}));
  const data = asRecord(raw);
  if (!response.ok) {
    throw new Error(String(data.error || "词灵群聊免费接口暂时不可用"));
  }
  const result = asRecord(data.result);
  return normalizeReply(result.reply);
}

async function consumeGroupChatStream(
  response: Response,
  handlers?: GroupSpiritChatHandlers,
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastEmitted = "";
  let finalReply: string | null = null;
  let finalError: string | null = null;
  const onReplyChunk = handlers?.onReplyChunk;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      let event: {
        type?: string;
        content?: string;
        result?: unknown;
        error?: string;
      };
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "chunk" && event.content) {
        if (event.content !== lastEmitted) {
          lastEmitted = event.content;
          onReplyChunk?.(event.content);
        }
      } else if (event.type === "done" && event.result) {
        finalReply = normalizeReply(asRecord(event.result).reply);
      } else if (event.type === "error") {
        finalError = String(event.error || "词灵群聊流式响应失败");
      }
    }
  }

  if (finalReply) return finalReply;
  if (finalError) throw new Error(finalError);
  return lastEmitted || "……";
}
