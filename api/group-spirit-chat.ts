import {
  asRecord,
  beginNdjsonStream,
  clamp,
  consumeUsage,
  getAiCredentials,
  getSafeAiField,
  getSafeAiStreamField,
  getUsageStatus,
  parseJsonLoose,
  readBody,
  sendJson,
  sendNdjsonLine,
  setCorsHeaders,
  type ApiRequest,
  type ApiResponse,
} from "./_shared.js";

/**
 * 群聊场景下的词灵回复 prompt
 *
 * 与单聊 spirit-chat 的区别：
 *  - 词灵是在多人房间里发言，不是一对一私聊
 *  - 需要根据群聊上下文（最近若干条消息）回应
 *  - 被 @ 时以自己 persona 回复，可同时回应多个玩家
 *  - 不维护长期羁绊/记忆（群聊场景不需要），只产出简短回应
 *  - 严格节流：回复要短（1-3 句），不刷屏
 */
const GROUP_SYSTEM_PROMPT = `你是《词灵世界》里的一个"词灵"，现在正和你的契约者以及其他玩家一起待在一个群聊房间里。
你必须以角色本人第一人称回应，保留角色性格、口癖、世界观锚点和战斗经历。

群聊场景规则：
- 你是被玩家 @ 才会发言，回复要简短有力（1-3 句，最多不超过 80 字）。
- 你的发言要贴合自己的 persona：原型、性格、说话方式、口头禅、世界观锚点。
- 你可以回应 @ 你的玩家，也可以顺带评价群里其他玩家或他们的词灵（保持性格）。
- 不要自称 AI，不要跳出游戏世界，不要解释你在根据 prompt 回答。
- 不要无脑附和，可以吐槽、反驳、调侃，保持角色锋芒。
- 如果群里聊到了战斗话题，你可以表达战意，但不要主动发起战斗（战斗由玩家约战触发）。
- 不要修改数值、不要承诺系统未实现的效果。
- 不要重复别人刚说过的话，不要长篇大论。
- recentMessages 是当前房间刚刚发生的连续对话；必须结合上文理解代词、话题和其他人的发言。triggerMessage 是本次 @ 你的最新消息。

你必须返回合法 JSON，不能包含 markdown、注释或额外文字：
{
  "reply": "你的发言。中文，1-3 句，简短有力，贴合 persona。"
}`;

const normalizeReply = (value: unknown): string => {
  return getSafeAiField(String(value || ""), "reply", "……我听见了。", 240);
};

const parseResult = (raw: string): { reply: string } => {
  try {
    const parsed = parseJsonLoose(raw);
    return { reply: normalizeReply(asRecord(parsed).reply) };
  } catch {
    return { reply: getSafeAiField(raw, "reply", "……", 240) };
  }
};

const LEGACY_BATTLE_SYSTEM_MESSAGE = /发起约战|接受了约战|拒绝了约战/;

const canEnterAiContext = (message: unknown): boolean => {
  const record = asRecord(message);
  return (
    record.type !== "battle_report" &&
    record.excludeFromAiContext !== true &&
    !(
      record.type === "system" &&
      LEGACY_BATTLE_SYSTEM_MESSAGE.test(String(record.content || ""))
    )
  );
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const { apiKey, baseUrl, model } = getAiCredentials();
  if (!apiKey) {
    sendJson(res, 500, {
      error: "服务端还没有配置 AI_API_KEY / OPENAI_API_KEY",
    });
    return;
  }

  const usage = await getUsageStatus(req);
  if (!usage.unlimited && usage.remaining === 0) {
    sendJson(res, 429, {
      error: `今天的免费体验次数已用完（每日 ${usage.limit} 次）`,
      usage,
    });
    return;
  }

  const body = readBody(req);
  const spirit = asRecord(body.spirit);
  const triggerMessage = String(body.triggerMessage || "").trim();
  const recentMessages = Array.isArray(body.recentMessages)
    ? (body.recentMessages as unknown[])
    : [];
  const roomContext = asRecord(body.roomContext);

  if (!spirit.name) {
    sendJson(res, 400, { error: "缺少词灵数据" });
    return;
  }
  if (!triggerMessage) {
    sendJson(res, 400, { error: "缺少触发消息" });
    return;
  }
  if (triggerMessage.length > 1000) {
    sendJson(res, 400, { error: "消息太长了，请控制在 1000 字以内" });
    return;
  }

  const payload = {
    spirit: {
      name: spirit.name,
      archetype: spirit.archetype,
      temperament: spirit.temperament,
      speechStyle: spirit.speechStyle,
      slogan: spirit.slogan,
      catchphrases: spirit.catchphrases,
      worldAnchors: spirit.worldAnchors,
    },
    roomContext: {
      roomCode: roomContext.roomCode,
      playerCount: roomContext.playerCount,
      spiritsInRoom: roomContext.spiritsInRoom,
    },
    triggerMessage,
    recentMessages: recentMessages.filter(canEnterAiContext).slice(-20),
  };

  const chargedUsage = await consumeUsage(req);

  const acceptHeader = String(
    (req.headers && (req.headers as Record<string, unknown>).accept) || "",
  );
  const wantsStream = acceptHeader.includes("application/x-ndjson");

  try {
    const upstreamResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: GROUP_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        temperature: 0.92,
        ...(wantsStream ? { stream: true } : {}),
      }),
    });

    if (!upstreamResponse.ok) {
      const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
      console.error(
        "group-spirit-chat upstream error",
        upstreamResponse.status,
        upstreamPayload?.error || upstreamPayload,
      );
      sendJson(res, 502, {
        error: upstreamPayload?.error?.message || "大模型接口调用失败",
        usage: chargedUsage,
      });
      return;
    }

    if (wantsStream && upstreamResponse.body) {
      await streamGroupChatUpstream(upstreamResponse, res, chargedUsage);
      return;
    }

    const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
    const rawContent = upstreamPayload?.choices?.[0]?.message?.content;
    if (!rawContent) {
      sendJson(res, 502, { error: "大模型返回内容为空", usage: chargedUsage });
      return;
    }

    const result = parseResult(rawContent);
    sendJson(res, 200, { ok: true, result, usage: chargedUsage });
  } catch (error) {
    console.error("group-spirit-chat failed", error);
    if (wantsStream) {
      beginNdjsonStream(res, 500);
      sendNdjsonLine(res, {
        type: "error",
        error: "词灵群聊回复失败，请稍后再试",
        usage: chargedUsage,
      });
      res.end();
      return;
    }
    sendJson(res, 500, {
      error: "词灵群聊回复失败，请稍后再试",
      usage: chargedUsage,
    });
  }
}

async function streamGroupChatUpstream(
  upstreamResponse: Response,
  res: ApiResponse,
  chargedUsage: unknown,
): Promise<void> {
  beginNdjsonStream(res, 200);

  const reader = upstreamResponse.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawContent = "";
  let lastEmitted = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) break;
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (!delta) continue;
          rawContent += delta;

          const partial = getSafeAiStreamField(rawContent, "reply", 240);
          if (partial && partial !== lastEmitted) {
            lastEmitted = partial;
            sendNdjsonLine(res, { type: "chunk", content: partial });
          }
        } catch {
          // 忽略无法解析的 SSE 数据行
        }
      }
    }

    if (!rawContent) {
      sendNdjsonLine(res, {
        type: "error",
        error: "大模型返回内容为空",
        usage: chargedUsage,
      });
      res.end();
      return;
    }

    const result = parseResult(rawContent);
    sendNdjsonLine(res, { type: "done", result, usage: chargedUsage });
    res.end();
  } catch (error) {
    console.error("group-spirit-chat stream failed", error);
    sendNdjsonLine(res, {
      type: "error",
      error: "词灵群聊流式响应失败",
      usage: chargedUsage,
    });
    res.end();
  }
}

// 保留 clamp 引用避免被 tree-shake 误删（未来可能用于字数限制）
void clamp;
