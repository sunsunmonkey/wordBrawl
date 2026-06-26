import OpenAI from 'openai';
import { CharacterData, Skill } from '../store/useGameStore';
import { ULTIMATE_TYPE_IDS, getUltimateTypeById } from '../data/ultimateTypes';

export type AIProviderMode = 'free' | 'custom';

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiMode?: AIProviderMode;
}

const buildClient = (cfg: AIConfig) => {
  return new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    dangerouslyAllowBrowser: true,
  });
};

const stripJsonFences = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
};

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

const normalizeCharacterData = (value: unknown): CharacterData => {
  const data = asRecord(value);
  const rawSkills = Array.isArray(data.skills) ? data.skills : [];
  const skills: Skill[] = rawSkills.map((rawSkill): Skill => {
    const s = asRecord(rawSkill);
    const rawType = String(s.type || 'attack');
    const type = (['attack', 'heal', 'buff', 'debuff', 'ultimate'].includes(rawType) ? rawType : 'attack') as Skill['type'];
    const isUltimate = Boolean(s.isUltimate) || type === 'ultimate';
    const requestedUltimateType = String(s.ultimateType || '');
    const ultimateType = isUltimate
      ? ULTIMATE_TYPE_IDS.includes(requestedUltimateType)
        ? requestedUltimateType
        : ULTIMATE_TYPE_IDS[0]
      : undefined;

    return {
      name: String(s.name || '未命名技能'),
      description: String(s.description || ''),
      damageMultiplier: clampNumber(s.damageMultiplier, 0, isUltimate ? 8 : 3.2, isUltimate ? 5.5 : 1),
      type,
      isUltimate,
      imagePrompt: s.imagePrompt ? String(s.imagePrompt) : undefined,
      imageUrl: isUltimate ? getUltimateTypeById(ultimateType)?.imageUrl : s.imageUrl ? String(s.imageUrl) : undefined,
      ultimateType,
      healPercent: s.healPercent ? clampInt(s.healPercent, 1, 70, 35) : undefined,
      buffPercent: s.buffPercent ? clampInt(s.buffPercent, 1, 120, 45) : undefined,
      buffTurns: s.buffTurns ? clampInt(s.buffTurns, 1, 6, 3) : undefined,
    };
  });

  const hp = clampInt(data.hp, 120, 900, 260);

  return {
    ...data,
    name: String(data.name || '未命名角色'),
    hp,
    maxHp: hp,
    attack: clampInt(data.attack, 20, 140, 45),
    defense: clampInt(data.defense, 5, 85, 25),
    speed: clampInt(data.speed, 1, 140, 55),
    imagePrompt: String(data.imagePrompt || 'cyberpunk game character portrait'),
    skills,
    ultimateCharge: 0,
    attackBuff: 0,
    defenseBuff: 0,
    buffTurnsLeft: 0,
  };
};

const generateCharacterWithFreeTrial = async (description: string): Promise<CharacterData> => {
  const response = await fetch('/api/generate-character', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });

  const payload = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new Error(String(payload.error || '免费体验接口暂时不可用，请稍后再试'));
  }

  if (!payload.character) {
    throw new Error('免费体验接口返回内容异常');
  }

  return normalizeCharacterData(payload.character);
};

export const generateCharacter = async (cfg: AIConfig, description: string): Promise<CharacterData> => {
  if ((cfg.apiMode || 'custom') === 'free') {
    return generateCharacterWithFreeTrial(description);
  }

  if (!cfg.apiKey) throw new Error('请先填写 API Key');
  if (!cfg.baseUrl) throw new Error('请先填写 Base URL');
  if (!cfg.model) throw new Error('请先填写 Model');

  const client = buildClient(cfg);

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

  const response = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: description }
    ],
    temperature: 0.95,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('AI 返回内容为空');

  const cleaned = stripJsonFences(content);

  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI 返回的内容不是合法的 JSON：' + cleaned.slice(0, 100));
    data = JSON.parse(match[0]);
  }

  return normalizeCharacterData(data);
};

// ============ 图片生成：Pollinations + 限流 + 可靠性增强 ============

/** 限流器：确保两次请求间至少间隔 minIntervalMs */
class RateLimiter {
  private lastCall = 0;
  constructor(private minIntervalMs: number) {}
  async wait(maxWaitMs = Number.POSITIVE_INFINITY): Promise<boolean> {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.minIntervalMs) {
      const waitMs = this.minIntervalMs - elapsed;
      if (waitMs > maxWaitMs) return false;
      await new Promise((r) => setTimeout(r, waitMs));
    }
    this.lastCall = Date.now();
    return true;
  }
}

// Pollinations anonymous image generation is queue-limited per IP. Keep starts conservative.
const globalLimiter = new RateLimiter(16_000);

export interface ImageLoadResult {
  ok: boolean;
  status?: number;
  rateLimited?: boolean;
  retryAfterMs?: number;
}

const parseRetryAfterMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
};

const loadViaImageElement = (url: string, timeoutMs: number): Promise<ImageLoadResult> => {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (result: ImageLoadResult) => {
      if (done) return;
      done = true;
      img.onload = null;
      img.onerror = null;
      resolve(result);
    };
    img.onload = () => {
      finish({ ok: img.naturalWidth > 0 && img.naturalHeight > 0 });
    };
    img.onerror = () => finish({ ok: false });
    img.src = url;
    setTimeout(() => finish({ ok: false }), timeoutMs);
  });
};

export const probeImage = async (url: string, timeoutMs = 30000): Promise<ImageLoadResult> => {
  if (!url) return { ok: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'image/*,*/*;q=0.8' },
      cache: 'default',
    });
    const contentType = response.headers.get('content-type') || '';
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return {
        ok: false,
        status: response.status,
        rateLimited: response.status === 429,
        retryAfterMs,
      };
    }

    const blob = await response.blob();
    return {
      ok: contentType.startsWith('image/') && blob.size > 0,
      status: response.status,
      retryAfterMs,
    };
  } catch {
    return loadViaImageElement(url, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 预加载图片，校验是否真的可访问且有效。
 * 关键：检查 naturalWidth > 0，因为空响应也会触发 onload。
 */
export const preloadImage = (url: string, timeoutMs = 30000): Promise<boolean> => {
  return probeImage(url, timeoutMs).then((result) => result.ok);
};

/** 构造 pollinations URL */
const buildPollinationsUrl = (
  prompt: string,
  width: number,
  height: number,
  seed: number,
  model?: string,
): string => {
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    nologo: 'true',
  });
  if (model) params.set('model', model);
  return `${base}?${params.toString()}`;
};

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 1_000_000;
};

/**
 * 生成角色头像
 * 使用当前可用且更快的 sana 模型；seed 按 prompt/player 固定，便于缓存复用。
 */
export const generateCharacterImage = async (
  _cfg: AIConfig,
  prompt: string,
  player: 1 | 2,
  modelOverride?: string,
): Promise<string> => {
  if (!prompt) return '';
  const cleaned = prompt.slice(0, 200);
  const enriched = `${cleaned}, neon cyberpunk character portrait, glowing rim light, dark background, anime style`;
  const seed = hashSeed(`${player}:${cleaned}`);
  const model = modelOverride === '' ? undefined : modelOverride ?? 'sana';
  const canStartRemoteRequest = await globalLimiter.wait(16_000);
  if (!canStartRemoteRequest) return '';
  return buildPollinationsUrl(enriched, 256, 256, seed, model);
};

/**
 * 进化形象专用：连续尝试多个模型 + 多个 seed，确保图片真的能被加载。
 * - 优先 sana（最快），失败再回退 flux / 默认
 * - 每次尝试都 probeImage 校验，确保返回的 URL 是真实可用的图片
 * - 全部失败返回空串，调用方需要 fallback 到旧头像
 */
export const generateEvolutionImage = async (
  prompt: string,
  options?: {
    seedSalt?: string;
    width?: number;
    height?: number;
    onAttempt?: (info: { attempt: number; total: number; model?: string }) => void;
  },
): Promise<string> => {
  if (!prompt) return '';
  const width = options?.width ?? 384;
  const height = options?.height ?? 384;
  const cleaned = prompt.slice(0, 220);
  const enriched = `${cleaned}, ascended evolution form, radiant aura, divine glow, ultra detailed anime key visual, cinematic lighting`;

  const seedSalt = options?.seedSalt ?? String(Date.now());
  const attempts = [
    { model: 'sana' as string | undefined, seedKey: `${seedSalt}:s1` },
    { model: 'flux' as string | undefined, seedKey: `${seedSalt}:s2` },
    { model: 'sana' as string | undefined, seedKey: `${seedSalt}:s3` },
    { model: undefined as string | undefined, seedKey: `${seedSalt}:s4` },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const { model, seedKey } = attempts[i];
    options?.onAttempt?.({ attempt: i + 1, total: attempts.length, model });
    const canStart = await globalLimiter.wait(20_000);
    if (!canStart) continue;
    const seed = hashSeed(seedKey);
    const url = buildPollinationsUrl(enriched, width, height, seed, model);
    const probe = await probeImage(url, 45_000);
    if (probe.ok) return url;
    if (probe.rateLimited && probe.retryAfterMs && probe.retryAfterMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(probe.retryAfterMs!, 8_000)));
    }
  }

  return '';
};

/**
 * 生成大招图片：根据 ultimateType 从该类型的图片池中随机挑选一张本地预设图
 * 不再调用远程图片 API，避免大招生成的不确定性与等待时间
 */
export const generateUltimateImage = async (
  _cfg: AIConfig,
  ultimateType: string,
  _player?: 1 | 2,
  _modelOverride?: string,
): Promise<string> => {
  void _player;
  void _modelOverride;
  const type = getUltimateTypeById(ultimateType) ?? getUltimateTypeById(ULTIMATE_TYPE_IDS[0]);
  if (!type) return '';
  const pool = [type.imageUrl, ...(type.alternateImageUrls || [])];
  return pool[Math.floor(Math.random() * pool.length)];
};
