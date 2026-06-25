import { getCache } from '@vercel/functions';
import { createHash } from 'node:crypto';

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

type UsageRecord = {
  count: number;
  date: string;
};

type HeaderValue = string | string[] | undefined;

type ApiRequest = {
  method?: string;
  headers?: Record<string, HeaderValue>;
  body?: unknown;
  socket?: {
    remoteAddress?: string;
  };
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
};

const memoryUsage = new Map<string, UsageRecord>();

const systemPrompt = `你是一个充满创意的游戏角色设计大师。
用户会输入一段角色描述，你需要根据这段描述，为角色生成游戏数值和【丰富多样的技能体系】。
你的返回必须是合法的、可被 JSON.parse 解析的纯 JSON 对象，绝对不要包含 markdown 代码块、注释或额外文字说明。

技能体系要求（必须包含 4-5 个技能）：
1. 一个普通攻击（type="attack"，damageMultiplier 1.0）
2. 一个强力攻击技能（type="attack"，damageMultiplier 1.3-1.8）
3. 一个治疗或增益技能（type="heal" 或 "buff"）
   - heal: healPercent 15-35（按 maxHp 百分比回血）
   - buff: buffPercent 20-50（攻击或防御提升百分比），buffTurns 2-3
4. 一个减益技能（type="debuff"，buffPercent 20-40 削弱对方，buffTurns 2-3）
5. 一个终极技能/大招（type="ultimate"，isUltimate=true，damageMultiplier 2.5-4.0）
   - 大招必须有 description 字段：详细描述释放时的华丽特效
   - 大招必须有 ultimateType 字段：从以下类型中挑选一个最贴合角色主题的 ID
     可选类型：${ULTIMATE_TYPE_IDS.join(', ')}
   - 例如火焰类角色选 "fire"，冰霜类选 "ice"，机甲类选 "mecha"，宇宙类选 "cosmic"

JSON 结构如下：
{
  "name": "角色名称（根据描述提取或生成一个响亮的名字）",
  "hp": 200,
  "attack": 25,
  "defense": 15,
  "speed": 50,
  "skills": [
    { "name": "普通攻击", "description": "基础攻击", "damageMultiplier": 1.0, "type": "attack" },
    { "name": "专属攻击技能名", "description": "技能描述", "damageMultiplier": 1.5, "type": "attack" },
    { "name": "治疗技能名", "description": "技能描述", "damageMultiplier": 0, "type": "heal", "healPercent": 25 },
    { "name": "增益技能名", "description": "技能描述", "damageMultiplier": 0, "type": "buff", "buffPercent": 30, "buffTurns": 2 },
    { "name": "减益技能名", "description": "技能描述", "damageMultiplier": 0.5, "type": "debuff", "buffPercent": 25, "buffTurns": 2 },
    { "name": "大招名称（要霸气）", "description": "详细的华丽特效描述", "damageMultiplier": 3.0, "type": "ultimate", "isUltimate": true, "ultimateType": "fire" }
  ],
  "imagePrompt": "用于生成头像的英文提示词，pixel art 或 cyberpunk 风格"
}
数值范围要求：hp 100-500，attack 10-50，defense 5-30，speed 1-100。
技能名称和描述要紧扣用户输入的角色主题，要有创意、有画面感、有中二气息。`;

const stripJsonFences = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
};

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

const asRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
};

const getHeader = (headers: Record<string, HeaderValue> | undefined, name: string): string | undefined => {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
};

const normalizeCharacter = (value: unknown) => {
  const data = asRecord(value);
  const hp = clamp(data.hp, 100, 500, 200);
  const skills = Array.isArray(data.skills) ? data.skills : [];

  return {
    name: String(data.name || '无名斗士').slice(0, 24),
    hp,
    maxHp: hp,
    attack: clamp(data.attack, 10, 50, 25),
    defense: clamp(data.defense, 5, 30, 15),
    speed: clamp(data.speed, 1, 100, 50),
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
        damageMultiplier: Number(skill.damageMultiplier) || (isUltimate ? 3 : 1),
        type,
        isUltimate,
        ultimateType,
        healPercent: skill.healPercent ? clamp(skill.healPercent, 1, 60, 25) : undefined,
        buffPercent: skill.buffPercent ? clamp(skill.buffPercent, 1, 80, 30) : undefined,
        buffTurns: skill.buffTurns ? clamp(skill.buffTurns, 1, 5, 2) : undefined,
      };
    }),
    ultimateCharge: 0,
    attackBuff: 0,
    defenseBuff: 0,
    buffTurnsLeft: 0,
  };
};

const getLimit = (): number => {
  const raw = process.env.FREE_DAILY_LIMIT ?? process.env.DAILY_FREE_LIMIT ?? '10';
  const limit = Number(raw);
  if (!Number.isFinite(limit)) return 10;
  return Math.max(0, Math.floor(limit));
};

const getDayKey = (): string => {
  const timezone = process.env.FREE_USAGE_TIMEZONE || 'Asia/Shanghai';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

const getClientKey = (req: ApiRequest): string => {
  const forwardedFor = String(getHeader(req.headers, 'x-forwarded-for') || '').split(',')[0].trim();
  const raw = forwardedFor || getHeader(req.headers, 'x-real-ip') || req.socket?.remoteAddress || 'anonymous';
  const salt = process.env.USAGE_HASH_SALT || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || 'word-brawl';
  return createHash('sha256').update(`${salt}:${raw}`).digest('hex').slice(0, 32);
};

const getUsageKey = (req: ApiRequest): string => `usage:${getDayKey()}:${getClientKey(req)}`;

const readUsage = async (key: string): Promise<UsageRecord> => {
  const fallback = { count: 0, date: getDayKey() };
  try {
    const cached = await getCache({ namespace: 'word-brawl' }).get(key);
    if (
      cached &&
      typeof cached === 'object' &&
      'count' in cached &&
      'date' in cached &&
      typeof cached.count === 'number' &&
      typeof cached.date === 'string'
    ) {
      const record = cached as UsageRecord;
      return { count: record.count, date: record.date };
    }
    return fallback;
  } catch {
    return memoryUsage.get(key) || fallback;
  }
};

const writeUsage = async (key: string, record: UsageRecord): Promise<void> => {
  try {
    await getCache({ namespace: 'word-brawl' }).set(key, record, {
      ttl: 60 * 60 * 36,
      tags: ['word-brawl-usage'],
    });
    return;
  } catch {
    memoryUsage.set(key, record);
  }
};

const getUsageStatus = async (req: ApiRequest) => {
  const limit = getLimit();
  if (limit === 0) {
    return { limit, used: 0, remaining: null, unlimited: true };
  }

  const usage = await readUsage(getUsageKey(req));
  return {
    limit,
    used: usage.count,
    remaining: Math.max(0, limit - usage.count),
    unlimited: false,
  };
};

const consumeUsage = async (req: ApiRequest) => {
  const limit = getLimit();
  if (limit === 0) {
    return { limit, used: 0, remaining: null, unlimited: true };
  }

  const key = getUsageKey(req);
  const usage = await readUsage(key);
  const next = { count: usage.count + 1, date: getDayKey() };
  await writeUsage(key, next);

  return {
    limit,
    used: next.count,
    remaining: Math.max(0, limit - next.count),
    unlimited: false,
  };
};

const readBody = (req: ApiRequest): Record<string, unknown> => {
  if (typeof req.body === 'string') {
    try {
      return asRecord(JSON.parse(req.body));
    } catch {
      return {};
    }
  }
  return asRecord(req.body);
};

const setCorsHeaders = (req: ApiRequest, res: ApiResponse) => {
  const origin = getHeader(req.headers, 'origin');
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  } else if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === getHeader(req.headers, 'host')) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    } catch {
      // Ignore invalid Origin headers.
    }
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const json = (res: ApiResponse, status: number, body: unknown) => {
  res.status(status).json(body);
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    json(res, 200, {
      ok: true,
      usage: await getUsageStatus(req),
      model: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    });
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    json(res, 500, {
      error: '服务端还没有配置 AI_API_KEY / OPENAI_API_KEY',
    });
    return;
  }

  const usage = await getUsageStatus(req);
  if (!usage.unlimited && usage.remaining === 0) {
    json(res, 429, {
      error: `今天的免费体验次数已用完（每日 ${usage.limit} 次）`,
      usage,
    });
    return;
  }

  const body = readBody(req);
  const description = String(body.description || '').trim();
  if (!description) {
    json(res, 400, { error: '请先输入角色描述' });
    return;
  }
  if (description.length > 1000) {
    json(res, 400, { error: '角色描述太长了，请控制在 1000 字以内' });
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
      json(res, 502, {
        error: upstreamPayload?.error?.message || '大模型接口调用失败，请检查服务端模型配置',
      });
      return;
    }

    const rawContent = upstreamPayload?.choices?.[0]?.message?.content;
    if (!rawContent) {
      json(res, 502, { error: '大模型返回内容为空' });
      return;
    }

    const cleaned = stripJsonFences(rawContent);
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        json(res, 502, { error: '大模型返回的内容不是合法 JSON' });
        return;
      }
      parsed = JSON.parse(match[0]);
    }

    const nextUsage = await consumeUsage(req);
    json(res, 200, {
      ok: true,
      character: normalizeCharacter(parsed),
      usage: nextUsage,
    });
  } catch (error) {
    console.error('generate-character failed', error);
    json(res, 500, { error: '角色生成失败，请稍后再试' });
  }
}
