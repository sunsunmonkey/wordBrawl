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
} from './_shared';

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

const systemPrompt = `你是一个充满创意的游戏角色设计大师。
用户会输入一段角色描述，你需要根据这段描述，为角色生成游戏数值和【丰富多样的技能体系】。
你的返回必须是合法的、可被 JSON.parse 解析的纯 JSON 对象，绝对不要包含 markdown 代码块、注释或额外文字说明。

技能体系要求（必须包含 4-5 个技能）：
1. 一个普通攻击（type="attack"，damageMultiplier 1.0）
2. 一个强力攻击技能（type="attack"，damageMultiplier 1.6-2.8）
3. 一个治疗或增益技能（type="heal" 或 "buff"）
   - heal: healPercent 18-55（按 maxHp 百分比回血）
   - buff: buffPercent 25-95（攻击或防御提升百分比），buffTurns 2-4
4. 一个减益技能（type="debuff"，buffPercent 25-80 削弱对方，buffTurns 2-4）
5. 一个终极技能/大招（type="ultimate"，isUltimate=true，damageMultiplier 4.0-7.5）
   - 大招必须有 description 字段：详细描述释放时的华丽特效
   - 大招必须有 ultimateType 字段：从以下类型中挑选一个最贴合角色主题的 ID
     可选类型：${ULTIMATE_TYPE_IDS.join(', ')}
   - 例如火焰类角色选 "fire"，冰霜类选 "ice"，机甲类选 "mecha"，宇宙类选 "cosmic"

数值分层要求：
- 先判断角色定位：玻璃大炮、重装坦克、极速刺客、均衡战士、回复消耗、控制削弱、低速 Boss 等。
- 每个角色只能有 1-2 个顶级强项，必须有至少 1 个明显短板。不要生成没有弱点的六边形角色。
- 顶级攻击或顶级速度角色通常要低 HP/低 defense；高 HP/高 defense 角色通常要低 speed 或较低 attack。
- 强力攻击技能倍率要按定位分层：坦克 1.6-2.2，均衡角色 2.0-2.5，玻璃炮/刺客 2.5-2.8。
- 大招倍率也要分层：坦克/消耗型 4.0-5.8，均衡强者 5.5-6.6，玻璃炮/脆皮爆发 6.6-7.5。

JSON 结构如下：
{
  "name": "角色名称（根据描述提取或生成一个响亮的名字）",
  "hp": 200,
  "attack": 45,
  "defense": 25,
  "speed": 50,
  "skills": [
    { "name": "普通攻击", "description": "基础攻击", "damageMultiplier": 1.0, "type": "attack" },
    { "name": "专属攻击技能名", "description": "技能描述", "damageMultiplier": 2.2, "type": "attack" },
    { "name": "治疗技能名", "description": "技能描述", "damageMultiplier": 0, "type": "heal", "healPercent": 35 },
    { "name": "增益技能名", "description": "技能描述", "damageMultiplier": 0, "type": "buff", "buffPercent": 60, "buffTurns": 3 },
    { "name": "减益技能名", "description": "技能描述", "damageMultiplier": 0.8, "type": "debuff", "buffPercent": 45, "buffTurns": 3 },
    { "name": "大招名称（要霸气）", "description": "详细的华丽特效描述", "damageMultiplier": 5.5, "type": "ultimate", "isUltimate": true, "ultimateType": "fire" }
  ],
  "imagePrompt": "用于生成头像的英文提示词，pixel art 或 cyberpunk 风格"
}
数值范围要求：hp 120-900，attack 20-140，defense 5-85，speed 1-140。请根据角色设定拉开差距，不要所有角色都给中庸数值；玻璃大炮、重装坦克、极速刺客、低速 Boss 都可以很极端。
技能名称和描述要紧扣用户输入的角色主题，要有创意、有画面感、有中二气息。`;

const normalizeCharacter = (value: unknown) => {
  const data = asRecord(value);
  const hp = clamp(data.hp, 120, 900, 260);
  const skills = Array.isArray(data.skills) ? data.skills : [];

  return {
    name: String(data.name || '无名斗士').slice(0, 24),
    hp,
    maxHp: hp,
    attack: clamp(data.attack, 20, 140, 45),
    defense: clamp(data.defense, 5, 85, 25),
    speed: clamp(data.speed, 1, 140, 55),
    imagePrompt: String(data.imagePrompt || 'cyberpunk game character portrait').slice(0, 240),
    skills: skills.slice(0, 6).map((skillValue, index: number) => {
      const skill = asRecord(skillValue);
      const rawType = String(skill.type || 'attack');
      const type = ['attack', 'heal', 'buff', 'debuff', 'ultimate'].includes(rawType) ? rawType : 'attack';
      const isUltimate = Boolean(skill.isUltimate) || type === 'ultimate';
      const requestedUltimateType = String(skill.ultimateType || '');
      const ultimateType = isUltimate && ULTIMATE_TYPE_IDS.includes(requestedUltimateType as typeof ULTIMATE_TYPE_IDS[number])
        ? requestedUltimateType
        : isUltimate
          ? ULTIMATE_TYPE_IDS[0]
          : undefined;

      return {
        name: String(skill.name || `技能 ${index + 1}`).slice(0, 32),
        description: String(skill.description || '').slice(0, 240),
        damageMultiplier: clampNumber(skill.damageMultiplier, 0, isUltimate ? 8 : 3.2, isUltimate ? 5.5 : 1),
        type,
        isUltimate,
        ultimateType,
        healPercent: skill.healPercent ? clamp(skill.healPercent, 1, 70, 35) : undefined,
        buffPercent: skill.buffPercent ? clamp(skill.buffPercent, 1, 120, 45) : undefined,
        buffTurns: skill.buffTurns ? clamp(skill.buffTurns, 1, 6, 3) : undefined,
      };
    }),
    ultimateCharge: 0,
    attackBuff: 0,
    defenseBuff: 0,
    buffTurnsLeft: 0,
  };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    const credentials = getAiCredentials();
    sendJson(res, 200, {
      ok: true,
      usage: await getUsageStatus(req),
      model: credentials.model,
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const { apiKey, baseUrl, model } = getAiCredentials();

  if (!apiKey) {
    sendJson(res, 500, {
      error: '服务端还没有配置 AI_API_KEY / OPENAI_API_KEY',
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
  const description = String(body.description || '').trim();
  if (!description) {
    sendJson(res, 400, { error: '请先输入角色描述' });
    return;
  }
  if (description.length > 1000) {
    sendJson(res, 400, { error: '角色描述太长了，请控制在 1000 字以内' });
    return;
  }

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
          { role: 'user', content: description },
        ],
        temperature: 0.95,
      }),
    });

    const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
    if (!upstreamResponse.ok) {
      console.error('AI upstream error', upstreamResponse.status, upstreamPayload?.error || upstreamPayload);
      sendJson(res, 502, {
        error: upstreamPayload?.error?.message || '大模型接口调用失败，请检查服务端模型配置',
      });
      return;
    }

    const rawContent = upstreamPayload?.choices?.[0]?.message?.content;
    if (!rawContent) {
      sendJson(res, 502, { error: '大模型返回内容为空' });
      return;
    }

    const cleaned = stripJsonFences(rawContent);
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        sendJson(res, 502, { error: '大模型返回的内容不是合法 JSON' });
        return;
      }
      parsed = JSON.parse(match[0]);
    }

    const nextUsage = await consumeUsage(req);
    sendJson(res, 200, {
      ok: true,
      character: normalizeCharacter(parsed),
      usage: nextUsage,
    });
  } catch (error) {
    console.error('generate-character failed', error);
    sendJson(res, 500, { error: '角色生成失败，请稍后再试' });
  }
}
