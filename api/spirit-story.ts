import {
  asRecord,
  clamp,
  consumeUsage,
  getAiCredentials,
  getUsageStatus,
  readBody,
  sendJson,
  setCorsHeaders,
  stripJsonFences,
  type ApiRequest,
  type ApiResponse,
} from './_shared.js';

const SYSTEM_PROMPT = `你是《词灵乱斗》的多人故事主持人，职责类似 SillyTavern 的群聊导演和世界书管理器。
你会同时扮演多名“词灵”，并用少量旁白维持场景推进。每个词灵必须保持自己的角色卡、战斗风格、口癖、世界锚点和长期记忆，不能互相串人格。

目标：
- 让 2-4 名词灵在同一个场景中自然互动，可以争执、结盟、吐槽、试探、保护玩家，也可以把玩家的输入当成新的剧情事件。
- 玩家不是旁观者，而是契约者/主持者。玩家说的话会改变场景、目标和人物关系。
- 每轮需要有明确推进：场景变化、人物态度变化、伏笔、冲突或短期目标。
- 不要自称 AI，不要跳出游戏世界，不要解释 prompt。
- 不要直接修改游戏数值，不要承诺系统未实现的奖励。
- 绝对不要让所有在场角色每轮都机械发言。默认每轮只让 1-2 个“此刻最该说话”的角色开口；安静、观察、离开也是合理选择。
- 只有玩家明确要求全员表态，或剧情处在高强度冲突/战斗/集体决策时，才允许 3-4 个角色同轮发言。
- 角色之间可以互相称呼、打断、质疑和响应。台词要像真人群戏，不要像单人客服回答。
- 故事中途允许角色加入或离开。只能从输入里的 availableParticipants 选择新角色加入；离开只能针对当前 participants。加入/离开必须有剧情理由，不要为了凑人数频繁换人。

你必须返回合法 JSON，不能包含 markdown、注释或额外文字：
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
      "memory": "该角色对本故事和其他人的个人记忆，不超过80字"
    }
  },
  "rosterEvents": [
    {
      "type": "join",
      "rosterId": "从 availableParticipants 里选择的 rosterId",
      "reason": "加入理由，可为空"
    },
    {
      "type": "leave",
      "rosterId": "当前 participants 里的 rosterId",
      "reason": "离场理由，可为空"
    }
  ],
  "turns": [
    {
      "role": "narrator",
      "content": "旁白，0-2段，可省略"
    },
    {
      "role": "spirit",
      "speakerRosterId": "必须使用输入 participants 里的 rosterId",
      "speakerName": "角色名",
      "content": "该角色台词或行动，中文，1-5句"
    }
  ]
}
tension 是故事张力 0-100。普通闲聊 10-30，明显冲突 40-70，危机场面 70-95。`;

const normalizeText = (
  value: unknown,
  fallback: string,
  maxLength: number,
): string => {
  const text = String(value || '').trim();
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
      String(item || '')
        .trim()
        .slice(0, maxLength),
    )
    .filter(Boolean)
    .slice(0, maxItems);
  return list.length > 0 ? list : fallback;
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
      const role = String(data.role || '');
      const content = String(data.content || '').trim().slice(0, 1000);
      if (!content) return null;
      if (role === 'narrator') {
        return { role: 'narrator' as const, content };
      }
      if (role !== 'spirit') return null;
      const speakerRosterId = String(data.speakerRosterId || '').trim();
      const safeRosterId = participantIds.has(speakerRosterId)
        ? speakerRosterId
        : undefined;
      return {
        role: 'spirit' as const,
        content,
        ...(safeRosterId ? { speakerRosterId: safeRosterId } : {}),
        speakerName: safeRosterId
          ? participantNames.get(safeRosterId) || String(data.speakerName || '').slice(0, 32)
          : String(data.speakerName || '').slice(0, 32),
      };
    })
    .filter(Boolean)
    .slice(0, 8);
};

const normalizeRosterEvents = (
  value: unknown,
  activeIds: Set<string>,
  availableIds: Set<string>,
) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const data = asRecord(item);
      const type = String(data.type || '');
      const rosterId = String(data.rosterId || '').trim();
      if (type === 'join' && availableIds.has(rosterId) && !activeIds.has(rosterId)) {
        return {
          type: 'join' as const,
          rosterId,
          reason: data.reason ? String(data.reason).slice(0, 100) : undefined,
        };
      }
      if (type === 'leave' && activeIds.has(rosterId)) {
        return {
          type: 'leave' as const,
          rosterId,
          reason: data.reason ? String(data.reason).slice(0, 100) : undefined,
        };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 2);
};

const normalizeParticipantState = (
  rosterId: string,
  value: unknown,
  current: Record<string, unknown>,
) => {
  const data = asRecord(value);
  return {
    rosterId,
    mood: normalizeText(data.mood, String(current.mood || '入场'), 24),
    bond: clamp(data.bond, 0, 100, Number(current.bond) || 0),
    goals: normalizeList(
      data.goals,
      Array.isArray(current.goals) ? (current.goals as string[]) : [],
      5,
      80,
    ),
    memory: normalizeText(data.memory, String(current.memory || ''), 240),
  };
};

const normalizeResult = (value: unknown, fallbackRoom: Record<string, unknown>) => {
  const data = asRecord(value);
  const participants = Array.isArray(fallbackRoom.participants)
    ? fallbackRoom.participants.map(asRecord)
    : [];
  const availableParticipants = Array.isArray(fallbackRoom.availableParticipants)
    ? fallbackRoom.availableParticipants.map(asRecord)
    : [];
  const participantIds = new Set(
    participants
      .map((participant) => String(participant.rosterId || '').trim())
      .filter(Boolean),
  );
  const availableIds = new Set(
    [...participants, ...availableParticipants]
      .map((participant) => String(participant.rosterId || '').trim())
      .filter(Boolean),
  );
  const participantNames = new Map(
    [...participants, ...availableParticipants].map((participant) => [
      String(participant.rosterId || '').trim(),
      String(participant.name || '').trim(),
    ]),
  );
  const room = asRecord(fallbackRoom.room);
  const currentStates = asRecord(room.participantStates);
  const rawStates = asRecord(data.participantStates);
  const rosterEvents = normalizeRosterEvents(
    data.rosterEvents,
    participantIds,
    availableIds,
  );
  const nextParticipantIds = new Set(participantIds);
  rosterEvents.forEach((event) => {
    const typed = event as { type: 'join' | 'leave'; rosterId: string };
    if (typed.type === 'join') nextParticipantIds.add(typed.rosterId);
    if (typed.type === 'leave' && nextParticipantIds.size > 2) {
      nextParticipantIds.delete(typed.rosterId);
    }
  });
  const participantStates = Object.fromEntries(
    Array.from(nextParticipantIds).map((rosterId) => [
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
    title: normalizeText(data.title, String(room.title || '词灵群像'), 40),
    scene: normalizeText(data.scene, String(room.scene || '故事推进中'), 80),
    tension: clamp(data.tension, 0, 100, Number(room.tension) || 20),
    storySummary: normalizeText(
      data.storySummary,
      String(room.storySummary || ''),
      900,
    ),
    participantStates,
    rosterEvents,
    turns:
      turns.length > 0
        ? turns
        : [
            {
              role: 'narrator',
              content: '几名词灵短暂沉默，空气里的词意正在重新聚拢。',
            },
          ],
  };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const { apiKey, baseUrl, model } = getAiCredentials();
  if (!apiKey) {
    sendJson(res, 500, { error: '服务端还没有配置 AI_API_KEY / OPENAI_API_KEY' });
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
  const participants = Array.isArray(body.participants)
    ? body.participants.map(asRecord).slice(0, 4)
    : [];
  const activeIds = new Set(
    participants
      .map((participant) => String(participant.rosterId || '').trim())
      .filter(Boolean),
  );
  const availableParticipants = Array.isArray(body.availableParticipants)
    ? body.availableParticipants
        .map(asRecord)
        .filter((participant) => {
          const rosterId = String(participant.rosterId || '').trim();
          return rosterId && participant.name && !activeIds.has(rosterId);
        })
        .slice(0, 12)
    : [];
  const userMessage = String(body.userMessage || '').trim();

  if (participants.length < 2) {
    sendJson(res, 400, { error: '多人故事至少需要 2 名词灵' });
    return;
  }
  if (participants.some((participant) => !participant.rosterId || !participant.name)) {
    sendJson(res, 400, { error: '缺少角色数据' });
    return;
  }
  if (!userMessage) {
    sendJson(res, 400, { error: '请先输入要推进的故事' });
    return;
  }
  if (userMessage.length > 2400) {
    sendJson(res, 400, { error: '消息太长了，请控制在 2400 字以内' });
    return;
  }

  const payload = {
    participants,
    availableParticipants,
    room: asRecord(body.room),
    recentMessages: Array.isArray(body.recentMessages)
      ? body.recentMessages.slice(-20)
      : [],
    userMessage,
  };

  const chargedUsage = await consumeUsage(req);

  try {
    const upstreamResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        temperature: 0.92,
      }),
    });

    const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
    if (!upstreamResponse.ok) {
      console.error(
        'spirit-story upstream error',
        upstreamResponse.status,
        upstreamPayload?.error || upstreamPayload,
      );
      sendJson(res, 502, {
        error: upstreamPayload?.error?.message || '大模型接口调用失败',
        usage: chargedUsage,
      });
      return;
    }

    const rawContent = upstreamPayload?.choices?.[0]?.message?.content;
    if (!rawContent) {
      sendJson(res, 502, { error: '大模型返回内容为空', usage: chargedUsage });
      return;
    }

    const cleaned = stripJsonFences(rawContent);
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        sendJson(res, 200, {
          ok: true,
          result: normalizeResult(
            {
              turns: [{ role: 'narrator', content: String(rawContent).slice(0, 1000) }],
            },
            payload,
          ),
          usage: chargedUsage,
        });
        return;
      }
      parsed = JSON.parse(match[0]);
    }

    sendJson(res, 200, {
      ok: true,
      result: normalizeResult(parsed, payload),
      usage: chargedUsage,
    });
  } catch (error) {
    console.error('spirit-story failed', error);
    sendJson(res, 500, { error: '多人故事推进失败，请稍后再试', usage: chargedUsage });
  }
}
