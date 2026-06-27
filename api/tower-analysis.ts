import {
  asRecord,
  clamp,
  clampNumber,
  consumeUsage,
  getAiCredentials,
  getUsageStatus,
  readBody,
  sendJson,
  setCorsHeaders,
  stripJsonFences,
  type ApiRequest,
  type ApiResponse,
} from './_shared.ts';

const ULTIMATE_TYPE_IDS = [
  'fire',
  'ice',
  'shadow',
  'lightning',
  'cosmic',
  'nature',
  'mecha',
  'holy',
] as const;

type Intent = 'analysis' | 'skill' | 'evolve';

const intentPrompts: Record<Intent, string> = {
  analysis: `请基于战斗记录给出简明的成长分析。返回 JSON：{
  "strengths": ["1-3 条角色当前的核心优势，使用中文短句"],
  "weaknesses": ["1-3 条短板/不足"],
  "suggestedTrait": "一句话，建议下一步成长方向（例如：补足生存，或学习一招控制技能）",
  "oneLine": "一句战斗复盘的金句总结"
}。`,
  skill: `请为这个角色生成 3 个互补且差异化的【非大招】技能候选，必须用于弥补当前短板（如缺治疗/缺控制/缺爆发）。
所有 candidate 的 type 必须从 ["attack","heal","buff","debuff"] 中选择，禁止给出 ultimate / isUltimate。
返回 JSON：{
  "candidates": [
    { "name": "技能名（中文，4-8字）", "description": "1-2 句中文描述", "type": "attack|heal|buff|debuff", "damageMultiplier": 1.6, "healPercent": 30, "buffPercent": 45, "buffTurns": 3 }
  ]
}
数值约束：attack 倍率 1.4-2.6；heal 的 healPercent 20-55；buff/debuff 的 buffPercent 25-90，buffTurns 2-4。`,
  evolve: `这个角色刚刚达到了进化阶段。请生成进化结果，返回 JSON：{
  "imagePrompt": "用于头像生成的英文 prompt，要体现角色进化后的形态升级（如装备/能量/披风/光环），200 字以内",
  "lore": "一段不超过 60 字的中文进化叙事",
  "newUltimate": { "name": "新大招名（可选）", "description": "若给出大招须含华丽中文描述", "damageMultiplier": 6.5, "type": "ultimate", "isUltimate": true, "ultimateType": "fire" }
}
ultimateType 必须为以下之一：${ULTIMATE_TYPE_IDS.join(', ')}。如果觉得不需要替换大招，可以省略 newUltimate 字段。`,
};

const baseSystemPrompt = `你是一个游戏角色养成顾问。
玩家在 PVE 九层塔中带着自己的角色挑战 Boss，请基于角色当前数值与一场战斗的聚合摘要，输出严格的 JSON 结果。
你的返回必须是合法的、可被 JSON.parse 解析的纯 JSON 对象，绝对不要包含 markdown 代码块、注释或额外文字说明。`;

const normalizeAnalysis = (value: unknown) => {
  const data = asRecord(value);
  const ensureStringArray = (input: unknown, max: number): string[] => {
    if (!Array.isArray(input)) return [];
    return input
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .slice(0, max);
  };
  return {
    strengths: ensureStringArray(data.strengths, 3),
    weaknesses: ensureStringArray(data.weaknesses, 3),
    suggestedTrait: String(data.suggestedTrait || '').slice(0, 80),
    oneLine: String(data.oneLine || '').slice(0, 80),
  };
};

const normalizeSkillCandidate = (value: unknown) => {
  const skill = asRecord(value);
  const rawType = String(skill.type || 'attack');
  const allowed = ['attack', 'heal', 'buff', 'debuff'];
  const type = allowed.includes(rawType) ? rawType : 'attack';
  return {
    name: String(skill.name || '新技能').slice(0, 24),
    description: String(skill.description || '').slice(0, 200),
    type,
    isUltimate: false,
    damageMultiplier: type === 'attack' ? clampNumber(skill.damageMultiplier, 1, 2.8, 1.8) : 0,
    healPercent: type === 'heal' ? clamp(skill.healPercent, 12, 60, 30) : undefined,
    buffPercent: type === 'buff' || type === 'debuff' ? clamp(skill.buffPercent, 15, 95, 45) : undefined,
    buffTurns: type === 'buff' || type === 'debuff' ? clamp(skill.buffTurns, 1, 4, 3) : undefined,
  };
};

const normalizeSkillResult = (value: unknown) => {
  const data = asRecord(value);
  const list = Array.isArray(data.candidates) ? data.candidates : [];
  return {
    candidates: list.slice(0, 3).map(normalizeSkillCandidate),
  };
};

const normalizeEvolveResult = (value: unknown) => {
  const data = asRecord(value);
  const newUltimate = asRecord(data.newUltimate);
  const hasUltimate = Object.keys(newUltimate).length > 0;
  let normalizedUltimate: ReturnType<typeof normalizeUltimate> | undefined;
  if (hasUltimate) {
    normalizedUltimate = normalizeUltimate(newUltimate);
  }
  return {
    imagePrompt: String(data.imagePrompt || '').slice(0, 240),
    lore: String(data.lore || '').slice(0, 200),
    newUltimate: normalizedUltimate,
  };
};

const normalizeUltimate = (skill: Record<string, unknown>) => {
  const requestedUltimateType = String(skill.ultimateType || '');
  const ultimateType = ULTIMATE_TYPE_IDS.includes(requestedUltimateType as typeof ULTIMATE_TYPE_IDS[number])
    ? requestedUltimateType
    : ULTIMATE_TYPE_IDS[0];
  return {
    name: String(skill.name || '终极一击').slice(0, 24),
    description: String(skill.description || '').slice(0, 240),
    type: 'ultimate' as const,
    isUltimate: true,
    damageMultiplier: clampNumber(skill.damageMultiplier, 4, 8, 6.5),
    ultimateType,
  };
};

const buildUserPrompt = (intent: Intent, payload: Record<string, unknown>) => {
  const sections = [
    `意图：${intent}`,
    `角色：${JSON.stringify(payload.character)}`,
    `战斗摘要：${JSON.stringify(payload.summary)}`,
  ];
  if (payload.context) {
    sections.push(`补充：${JSON.stringify(payload.context)}`);
  }
  return sections.join('\n');
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
  const intent = String(body.intent || 'analysis') as Intent;
  if (!intentPrompts[intent]) {
    sendJson(res, 400, { error: 'intent 必须为 analysis / skill / evolve 之一' });
    return;
  }

  const character = asRecord(body.character);
  const summary = asRecord(body.summary);
  if (!character.name || !summary) {
    sendJson(res, 400, { error: '缺少 character 或 summary' });
    return;
  }

  const systemPrompt = `${baseSystemPrompt}\n\n${intentPrompts[intent]}`;
  const userPrompt = buildUserPrompt(intent, { character, summary, context: body.context });
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
      }),
    });

    const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
    if (!upstreamResponse.ok) {
      console.error('tower-analysis upstream error', upstreamResponse.status, upstreamPayload?.error || upstreamPayload);
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
        sendJson(res, 502, { error: '大模型返回的内容不是合法 JSON', usage: chargedUsage });
        return;
      }
      parsed = JSON.parse(match[0]);
    }

    let payload: unknown;
    if (intent === 'analysis') payload = normalizeAnalysis(parsed);
    else if (intent === 'skill') payload = normalizeSkillResult(parsed);
    else payload = normalizeEvolveResult(parsed);

    sendJson(res, 200, {
      ok: true,
      intent,
      result: payload,
      usage: chargedUsage,
    });
  } catch (error) {
    console.error('tower-analysis failed', error);
    sendJson(res, 500, { error: '塔战分析失败，请稍后再试', usage: chargedUsage });
  }
}
