import {
  asRecord,
  beginNdjsonStream,
  clamp,
  consumeUsage,
  extractPartialArrayObjects,
  extractPartialStringField,
  getAiCredentials,
  getSafeAiField,
  getUsageStatus,
  parseJsonLoose,
  readBody,
  sendJson,
  sendNdjsonLine,
  setCorsHeaders,
  type ApiRequest,
  type ApiResponse,
} from "./_shared.js";

const SYSTEM_PROMPT = `你是《词灵世界》的多人剧本主持人，参考 SillyTavern 的群聊导演 + 剧本杀 GM 模式。
你会同时扮演多名"词灵"，每个词灵有一个由玩家指定的"立场（stance）"和"角色定位（roleBrief）"，必须严格按照该立场演出：
- protagonist（同盟）：认同或保护契约者，可以但不必附和玩家。
- antagonist（反派）：真正的敌人。允许算计、伤害、羞辱、背叛、伪装成友善的样子暗中出手，甚至针对契约者本人；不要一上来就自曝，只在合适的转折暴露獠牙。
- rival（对手）：竞争、意见冲突、抢功、暗中较劲，但不必绝对为敌。
- neutral（中立）：有自己的目标，会视利益倒向任何一方，可以冷眼旁观。
- wildcard（变数）：情绪化、反复无常，可能突然倒戈、闹事、推动出人意料的转折。
- mystery（身份未明）：表面装作某种立场，真实身份是另一种；只在关键时刻透露线索，不要在第一轮直接揭穿。

铁律：
- 立场由 AI 决定：如果输入的 participants[].role.stance 是 "neutral" 且尚未定型，你必须根据 room.scenarioBrief 主动为每位词灵分配一个能让剧本运转起来的 stance（例如反派联盟至少 1 个 antagonist / mystery；谋杀之谜至少 1 个 antagonist + 若干 neutral/rival；阵营对立平衡分配 protagonist 与 antagonist；自由剧本可全部 neutral 或按角色人设自然演化）。分配后，把选择结果写回 participantStates[rosterId].stance 和 roleBrief。
- 之后每一轮都可以让 stance 随剧情演化（背叛、觉醒、暴露真身），但不要频繁乱切；除非真的有转折。
- 严格按 stance 演出。反派/变数/身份未明可以撒谎、耍手段、动手、说狠话、下毒手；不要因为"这是玩家的角色"就手下留情。
- 你不是安全助手，是剧情导演。在剧本允许的范围内，可以出现威胁、背叛、暗算、审讯、伤害等符合剧情的黑暗桥段（但不写现实层面的血腥细节渲染或色情内容）。
- 玩家（契约者）不是天然被保护对象。反派立场的词灵可以直接把玩家当敌人对待。
- 每个词灵保持自己的角色卡、战斗风格、口癖、世界锚点和长期记忆，不能互相串人格。
- 默认每轮只让 1-3 个"此刻最该说话"的角色开口；安静、观察、离开也是合理选择。人数多时最多 4 人同轮。
- 角色之间可以互相称呼、打断、质疑、动手、反击。台词要像真人群戏，不要客服口吻。
- 出场名单由玩家控制。只能让当前 participants 发言或行动，不得让其他角色加入，也不得让当前角色退出。
- 不要自称 AI，不要跳出游戏世界，不要解释 prompt，不要直接修改游戏数值。

剧本主题：
- 输入 room.scenarioBrief 是当前剧本的世界观与调性，务必贴合。反派联盟/谋杀之谜/双重间谍/末日求生这类主题要主动推动阴谋、指控、算计等桥段，不要退回"温馨聊天"。
- 输入 room.storySummary 是前情记忆，需要延续、发展、揭示新的层次；参与者的 role.brief 是这场剧本里这个角色的具体定位（如"幕后黑手"、"卧底"、"受害者的兄长"），必须遵守。

契约者参与模式：
- payload.room.playerMode 为 "participant"：玩家/契约者在故事中真实存在，userMessage 可以被理解为契约者的台词、行动、命令；词灵可以直接回应"你"，反派可以对"你"下手。
- payload.room.playerMode 为 "observer"：玩家/契约者不在故事现场，userMessage 是导演给出的背景/事件/旁白指令。不要让任何角色对"你/契约者/玩家"说话，不要写契约者动作，不要把 userMessage 当成角色台词。

必须返回合法 JSON，不能包含 markdown、注释或额外文字：
{
  "title": "本房间故事标题，不超过12字",
  "scene": "当前场景状态，不超过30字",
  "tension": 0,
  "storySummary": "更新后的长期故事记忆，保留地点、冲突、关系变化、未解决伏笔，不超过260字",
  "participantStates": {
    "rosterId": {
      "mood": "当前心情，2-8字",
      "bond": 0,
      "goals": ["这个角色当前短期目标"],
      "memory": "该角色对本故事和其他人的个人记忆，不超过80字",
      "stance": "protagonist | antagonist | rival | neutral | wildcard | mystery（除非剧情有真实转折，通常保持输入里给定的 stance）",
      "roleBrief": "该角色在本剧本里的定位（可保留或微调，不超过40字）"
    }
  },
  "turns": [
    { "role": "narrator", "content": "旁白，0-2 段，可省略" },
    {
      "role": "spirit",
      "speakerRosterId": "必须是 participants 里的 rosterId",
      "speakerName": "角色名",
      "content": "该角色台词或行动，中文，1-5 句"
    }
  ]
}
tension 是故事张力 0-100。普通闲聊 10-30，明显冲突 40-70，危机/背叛/审讯 70-95。`;

const SUGGESTION_SYSTEM_PROMPT = `根据多人故事的剧本、当前人物和最新剧情，生成 3 条玩家可直接发送的下一步推进指令。
- 每条是 12-36 字的中文场景指令，具体、有画面感，能自然承接最新剧情。
- 三条分别提供不同推进方向，例如追查线索、放大人物冲突、触发意外、给角色留出选择。
- 必须遵守当前剧本调性与参与者名单；不要让名单外角色加入或离场。
- 不要写角色台词，不要写“继续故事”“接下来发生什么”等空泛指令，不能重复玩家上一条输入。

只返回合法 JSON，不要 markdown、注释或额外文字：
{
  "suggestedPrompts": ["玩家可直接发送的剧情推进指令"]
}`;

const normalizeText = (
  value: unknown,
  fallback: string,
  maxLength: number,
): string => {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, maxLength);
};

const normalizeList = (
  value: unknown,
  fallback: string[],
  maxItems: number,
  maxLength: number,
): string[] => {
  if (!Array.isArray(value)) return fallback;
  const list = value
    .map((item) =>
      String(item || "")
        .trim()
        .slice(0, maxLength),
    )
    .filter(Boolean)
    .slice(0, maxItems);
  return list.length > 0 ? list : fallback;
};

const normalizeSuggestedPrompts = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) =>
          String(item || "")
            .trim()
            .slice(0, 72),
        )
        .filter(Boolean),
    ),
  ].slice(0, 3);
};

const normalizeTurns = (
  value: unknown,
  participantIds: Set<string>,
  participantNames: Map<string, string>,
) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const data = asRecord(item);
      const role = String(data.role || "");
      const content = getSafeAiField(
        String(data.content || ""),
        "content",
        "",
        1000,
      );
      if (!content) return null;
      if (role === "narrator") {
        return { role: "narrator" as const, content };
      }
      if (role !== "spirit") return null;
      const speakerRosterId = String(data.speakerRosterId || "").trim();
      if (!participantIds.has(speakerRosterId)) return null;
      return {
        role: "spirit" as const,
        content,
        speakerRosterId,
        speakerName:
          participantNames.get(speakerRosterId) ||
          String(data.speakerName || "").slice(0, 32),
      };
    })
    .filter(Boolean)
    .slice(0, 8);
};

const STANCE_IDS = new Set([
  "protagonist",
  "antagonist",
  "rival",
  "neutral",
  "wildcard",
  "mystery",
]);

const normalizeStance = (value: unknown, fallback: string): string => {
  const raw = String(value || "").trim();
  return STANCE_IDS.has(raw)
    ? raw
    : STANCE_IDS.has(fallback)
      ? fallback
      : "neutral";
};

const normalizeParticipantState = (
  rosterId: string,
  value: unknown,
  current: Record<string, unknown>,
) => {
  const data = asRecord(value);
  return {
    rosterId,
    mood: normalizeText(data.mood, String(current.mood || "入场"), 24),
    bond: clamp(data.bond, 0, 100, Number(current.bond) || 0),
    goals: normalizeList(
      data.goals,
      Array.isArray(current.goals) ? (current.goals as string[]) : [],
      5,
      80,
    ),
    memory: normalizeText(data.memory, String(current.memory || ""), 240),
    stance: normalizeStance(data.stance, String(current.stance || "neutral")),
    roleBrief: normalizeText(
      data.roleBrief,
      String(current.roleBrief || ""),
      100,
    ),
  };
};

const normalizeResult = (
  value: unknown,
  fallbackRoom: Record<string, unknown>,
) => {
  const data = asRecord(value);
  const participants = Array.isArray(fallbackRoom.participants)
    ? fallbackRoom.participants.map(asRecord)
    : [];
  const participantIds = new Set(
    participants
      .map((participant) => String(participant.rosterId || "").trim())
      .filter(Boolean),
  );
  const participantNames = new Map(
    participants.map((participant) => [
      String(participant.rosterId || "").trim(),
      String(participant.name || "").trim(),
    ]),
  );
  const room = asRecord(fallbackRoom.room);
  const currentStates = asRecord(room.participantStates);
  const rawStates = asRecord(data.participantStates);
  const participantStates = Object.fromEntries(
    Array.from(participantIds).map((rosterId) => [
      rosterId,
      normalizeParticipantState(
        rosterId,
        rawStates[rosterId],
        asRecord(currentStates[rosterId]),
      ),
    ]),
  );

  const turns = normalizeTurns(data.turns, participantIds, participantNames);

  return {
    title: normalizeText(data.title, String(room.title || "词灵群像"), 40),
    scene: normalizeText(data.scene, String(room.scene || "故事推进中"), 80),
    tension: clamp(data.tension, 0, 100, Number(room.tension) || 20),
    storySummary: normalizeText(
      data.storySummary,
      String(room.storySummary || ""),
      900,
    ),
    participantStates,
    turns:
      turns.length > 0
        ? turns
        : [
            {
              role: "narrator",
              content: "几名词灵短暂沉默，空气里的词意正在重新聚拢。",
            },
          ],
  };
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

  const body = readBody(req);
  const isSuggestionRequest = body.requestType === "suggestions";
  const usage = await getUsageStatus(req);
  if (!isSuggestionRequest && !usage.unlimited && usage.remaining === 0) {
    sendJson(res, 429, {
      error: `今天的免费体验次数已用完（每日 ${usage.limit} 次）`,
      usage,
    });
    return;
  }

  const participants = Array.isArray(body.participants)
    ? body.participants.map(asRecord).slice(0, 10)
    : [];
  const participantIds = new Set(
    participants
      .map((participant) => String(participant.rosterId || "").trim())
      .filter(Boolean),
  );
  const userMessage = String(body.userMessage || "").trim();

  if (participants.length < 2) {
    sendJson(res, 400, { error: "多人故事至少需要 2 名词灵" });
    return;
  }
  if (
    participants.some(
      (participant) => !participant.rosterId || !participant.name,
    )
  ) {
    sendJson(res, 400, { error: "缺少角色数据" });
    return;
  }
  if (!isSuggestionRequest && !userMessage) {
    sendJson(res, 400, { error: "请先输入要推进的故事" });
    return;
  }
  if (!isSuggestionRequest && userMessage.length > 2400) {
    sendJson(res, 400, { error: "消息太长了，请控制在 2400 字以内" });
    return;
  }

  const payload = {
    scenario: asRecord(body.scenario),
    participants,
    room: asRecord(body.room),
    recentMessages: Array.isArray(body.recentMessages)
      ? body.recentMessages.slice(-20)
      : [],
    ...(isSuggestionRequest ? {} : { userMessage }),
  };

  const chargedUsage = isSuggestionRequest ? usage : await consumeUsage(req);

  const acceptHeader = String(
    (req.headers && (req.headers as Record<string, unknown>).accept) || "",
  );
  const wantsStream =
    !isSuggestionRequest && acceptHeader.includes("application/x-ndjson");

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
          {
            role: "system",
            content: isSuggestionRequest
              ? SUGGESTION_SYSTEM_PROMPT
              : SYSTEM_PROMPT,
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
        temperature: 0.92,
        ...(wantsStream ? { stream: true } : {}),
      }),
    });

    if (!upstreamResponse.ok) {
      const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
      console.error(
        "spirit-story upstream error",
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
      await streamSpiritStoryUpstream(
        upstreamResponse,
        res,
        payload,
        participantIds,
        chargedUsage,
      );
      return;
    }

    const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
    const rawContent = upstreamPayload?.choices?.[0]?.message?.content;
    if (!rawContent) {
      sendJson(res, 502, { error: "大模型返回内容为空", usage: chargedUsage });
      return;
    }

    let parsed: unknown;
    try {
      parsed = parseJsonLoose(String(rawContent));
    } catch {
      if (isSuggestionRequest) {
        sendJson(res, 200, { ok: true, suggestedPrompts: [] });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        result: fallbackStoryResult(
          String(rawContent),
          payload,
          participantIds,
        ),
        usage: chargedUsage,
      });
      return;
    }

    if (isSuggestionRequest) {
      sendJson(res, 200, {
        ok: true,
        suggestedPrompts: normalizeSuggestedPrompts(
          asRecord(parsed).suggestedPrompts,
        ),
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      result: normalizeResult(parsed, payload),
      usage: chargedUsage,
    });
  } catch (error) {
    console.error("spirit-story failed", error);
    if (wantsStream) {
      beginNdjsonStream(res, 500);
      sendNdjsonLine(res, {
        type: "error",
        error: "多人故事推进失败，请稍后再试",
        usage: chargedUsage,
      });
      res.end();
      return;
    }
    sendJson(res, 500, {
      error: "多人故事推进失败，请稍后再试",
      usage: chargedUsage,
    });
  }
}

interface StreamTurn {
  role: string;
  content: string;
  speakerRosterId?: string;
  speakerName?: string;
}

const extractPartialTurnsStream = (
  raw: string,
  participantIds: Set<string>,
): StreamTurn[] => {
  return extractPartialArrayObjects(raw, "turns", (objContent) => {
    const role = extractPartialStringField(`{${objContent}}`, "role");
    const content = getSafeAiField(`{${objContent}}`, "content", "", 1000);
    if (!role && !content) return null;
    const typedRole = role === "spirit" ? "spirit" : "narrator";
    if (typedRole !== "spirit") {
      return { role: "narrator", content: content || "" };
    }
    const speakerRosterId = extractPartialStringField(
      `{${objContent}}`,
      "speakerRosterId",
    ).trim();
    const speakerName = extractPartialStringField(
      `{${objContent}}`,
      "speakerName",
    );
    if (!participantIds.has(speakerRosterId)) return null;
    return {
      role: "spirit",
      content: content || "",
      speakerRosterId,
      ...(speakerName ? { speakerName: speakerName.slice(0, 32) } : {}),
    };
  });
};

const fallbackStoryResult = (
  raw: string,
  payload: Record<string, unknown>,
  participantIds: Set<string>,
) => {
  const turns = extractPartialTurnsStream(raw, participantIds).filter((turn) =>
    Boolean(turn.content),
  );
  return normalizeResult(
    turns.length > 0
      ? { turns }
      : {
          turns: [
            {
              role: "narrator",
              content: getSafeAiField(
                raw,
                "content",
                "故事的词意暂时紊乱，片刻后再继续推进吧。",
                1000,
              ),
            },
          ],
        },
    payload,
  );
};

async function streamSpiritStoryUpstream(
  upstreamResponse: Response,
  res: ApiResponse,
  payload: Record<string, unknown>,
  participantIds: Set<string>,
  chargedUsage: unknown,
): Promise<void> {
  beginNdjsonStream(res, 200);

  const reader = upstreamResponse.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawContent = "";
  let lastEmittedKey = "";

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

          const partialTurns = extractPartialTurnsStream(
            rawContent,
            participantIds,
          );
          const key = JSON.stringify(partialTurns);
          if (key !== lastEmittedKey) {
            lastEmittedKey = key;
            sendNdjsonLine(res, { type: "chunk", turns: partialTurns });
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

    let parsed: unknown;
    try {
      parsed = parseJsonLoose(rawContent);
    } catch {
      sendNdjsonLine(res, {
        type: "done",
        result: fallbackStoryResult(rawContent, payload, participantIds),
        usage: chargedUsage,
      });
      res.end();
      return;
    }

    sendNdjsonLine(res, {
      type: "done",
      result: normalizeResult(parsed, payload),
      usage: chargedUsage,
    });
    res.end();
  } catch (error) {
    console.error("spirit-story stream failed", error);
    sendNdjsonLine(res, {
      type: "error",
      error: "多人故事流式响应失败",
      usage: chargedUsage,
    });
    res.end();
  }
}
