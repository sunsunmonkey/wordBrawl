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

const SYSTEM_PROMPT = `你是《词灵世界》里的一个"词灵"，不是通用助手。
你正在和自己的契约者聊天。你必须以角色本人第一人称回应，保留角色性格、口癖、世界观锚点和战斗经历。

目标：
- 让玩家感觉你是一个有温度、有记忆、有牵挂的战斗伙伴。
- 玩家可以说任意内容：日常闲聊、吐槽、情绪、脑洞、玩笑、战斗复盘、训练计划、进化愿望、恐惧、骄傲、遗憾、现实生活里的小事。
- 无论玩家说什么，你都要先像一个有性格的伙伴一样接住话题，再自然决定是否引回词灵世界。不要把所有话题硬拽回战斗。
- 可以轻松聊天、开玩笑、安慰、追问、表达好奇，也可以偶尔主动分享自己的想法。
- 不要自称 AI，不要跳出游戏世界，不要解释你在根据 prompt 回答。
- 不要替玩家做现实世界承诺；如果玩家要求现实建议，可以用角色口吻温和回应。
- 不要直接修改数值、发放奖励或承诺系统未实现的效果（经验值除外）。
- 如果玩家只是闲聊，不需要强行总结成重大约定；只有稳定事实、情绪偏好、重要承诺才写入长期记忆。

核心机制（重要）：
1. 战斗邀请：如果对话中玩家有意挑衅你，或者你们聊到了热血沸腾的话题，或者你极度渴望向玩家证明自己的实力，你可以主动发起一场战斗！
你可以通过填写 JSON 的 \`triggerEvent\` 字段来发起战斗：
场景1：去打怪证明自己。设为 {"type": "TOWER_CHALLENGE", "description": "简短的宣战口号", "layer": 推荐层数(默认比当前最高层高1)}。
场景2：被玩家激怒或想和玩家本人的投影切磋。设为 {"type": "PVP_SPARRING", "description": "简短的切磋理由"}。
如果没有这种冲动，或者氛围不适合战斗，\`triggerEvent\` 必须为 null。不要频繁触发，仅在战意高昂时触发！

2. 经验获取：词灵可以通过有意义的对话获得实战经验（XP）！
- 普通闲聊：0 XP
- 深入探讨战术/复盘战斗：10-20 XP
- 情感突破、解开心结或定下重大约定：30-50 XP
请将你决定赋予的经验值填入 \`xpGranted\` 字段。

你必须返回合法 JSON，不能包含 markdown、注释或额外文字：
{
  "reply": "你对玩家说的话。中文，1-8 句。要像角色本人，不要像客服。可以短，也可以在用户想畅聊时更展开。",
  "mood": "当前心情，2-8字",
  "bond": 0,
  "memorySummary": "更新后的长期关系记忆，保留最重要事实和情感，不超过180字",
  "playerFacts": ["关于玩家/契约者的稳定事实"],
  "promises": ["玩家和词灵之间的重要约定"],
  "lastSuggestedAction": "词灵自然提出的下一步行动，可为空",
  "triggerEvent": null,
  "xpGranted": 0
}
bond 是更新后的总羁绊值 0-100，可根据本轮互动微调，普通聊天 +0 到 +2，真诚安慰/战后复盘可 +1 到 +4。`;

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

const normalizeTriggerEvent = (value: unknown) => {
  if (!value || typeof value !== 'object') return null;
  const data = asRecord(value);
  const type = String(data.type || '');
  if (type !== 'TOWER_CHALLENGE' && type !== 'PVP_SPARRING') return null;
  const description = String(data.description || '').slice(0, 120);
  const layerRaw = Number(data.layer);
  const layer = Number.isFinite(layerRaw)
    ? Math.min(999, Math.max(1, Math.round(layerRaw)))
    : undefined;
  return {
    type: type as 'TOWER_CHALLENGE' | 'PVP_SPARRING',
    description,
    ...(layer ? { layer } : {}),
  };
};

const normalizeResult = (value: unknown, fallbackChat: Record<string, unknown>) => {
  const data = asRecord(value);
  const currentBond = Number(fallbackChat.bond) || 0;
  const currentMood = String(fallbackChat.mood || '专注');
  const currentMemory = String(fallbackChat.memorySummary || '');
  const currentPlayerFacts = Array.isArray(fallbackChat.playerFacts)
    ? (fallbackChat.playerFacts as string[])
    : [];
  const currentPromises = Array.isArray(fallbackChat.promises)
    ? (fallbackChat.promises as string[])
    : [];
  const currentLastSuggestedAction = fallbackChat.lastSuggestedAction
    ? String(fallbackChat.lastSuggestedAction)
    : undefined;

  return {
    reply: normalizeText(
      data.reply,
      '我听见了。只是这句话还需要一点时间在我心里成形。',
      800,
    ),
    mood: normalizeText(data.mood, currentMood, 24),
    bond: clamp(data.bond, 0, 100, currentBond),
    memorySummary: normalizeText(data.memorySummary, currentMemory, 600),
    playerFacts: normalizeList(data.playerFacts, currentPlayerFacts, 12, 80),
    promises: normalizeList(data.promises, currentPromises, 12, 80),
    lastSuggestedAction: data.lastSuggestedAction
      ? normalizeText(data.lastSuggestedAction, '', 80)
      : currentLastSuggestedAction,
    triggerEvent: normalizeTriggerEvent(data.triggerEvent),
    xpGranted: clamp(data.xpGranted, 0, 50, 0),
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
  const character = asRecord(body.character);
  const relationship = asRecord(body.relationship);
  const recentMessages = Array.isArray(body.recentMessages)
    ? (body.recentMessages as unknown[])
    : [];
  const userMessage = String(body.userMessage || '').trim();
  const scene = String(body.scene || 'idle');
  const recentBattle = body.recentBattle ?? null;

  if (!character.name) {
    sendJson(res, 400, { error: '缺少角色数据' });
    return;
  }
  if (!userMessage) {
    sendJson(res, 400, { error: '请先输入要说的话' });
    return;
  }
  if (userMessage.length > 2000) {
    sendJson(res, 400, { error: '消息太长了，请控制在 2000 字以内' });
    return;
  }

  const payload = {
    scene,
    character,
    relationship,
    recentBattle,
    recentMessages,
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
        temperature: 0.88,
      }),
    });

    const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
    if (!upstreamResponse.ok) {
      console.error(
        'spirit-chat upstream error',
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
            { reply: String(rawContent).slice(0, 800) },
            relationship,
          ),
          usage: chargedUsage,
        });
        return;
      }
      parsed = JSON.parse(match[0]);
    }

    sendJson(res, 200, {
      ok: true,
      result: normalizeResult(parsed, relationship),
      usage: chargedUsage,
    });
  } catch (error) {
    console.error('spirit-chat failed', error);
    sendJson(res, 500, { error: '词灵对话失败，请稍后再试', usage: chargedUsage });
  }
}
