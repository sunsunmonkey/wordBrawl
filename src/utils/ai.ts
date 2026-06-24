import OpenAI from 'openai';
import { CharacterData, Skill } from '../store/useGameStore';
import { ULTIMATE_TYPE_IDS, getUltimateTypeById } from '../data/ultimateTypes';

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
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

export const generateCharacter = async (cfg: AIConfig, description: string): Promise<CharacterData> => {
  if (!cfg.apiKey) throw new Error('请先填写 API Key');
  if (!cfg.baseUrl) throw new Error('请先填写 Base URL');
  if (!cfg.model) throw new Error('请先填写 Model');

  const client = buildClient(cfg);

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

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (err) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI 返回的内容不是合法的 JSON：' + cleaned.slice(0, 100));
    data = JSON.parse(match[0]);
  }

  // 规范化技能数据，确保 type 字段存在
  const skills: Skill[] = (data.skills || []).map((s: any): Skill => {
    const type = (s.type as Skill['type']) || 'attack';
    const isUltimate = Boolean(s.isUltimate) || type === 'ultimate';
    const ultimateType = isUltimate
      ? ULTIMATE_TYPE_IDS.includes(s.ultimateType)
        ? s.ultimateType
        : ULTIMATE_TYPE_IDS[0]
      : undefined;

    return {
      name: s.name || '未命名技能',
      description: s.description || '',
      damageMultiplier: Number(s.damageMultiplier) || 1.0,
      type,
      isUltimate,
      imagePrompt: s.imagePrompt,
      imageUrl: isUltimate ? getUltimateTypeById(ultimateType)?.imageUrl : s.imageUrl,
      ultimateType,
      healPercent: s.healPercent ? Number(s.healPercent) : undefined,
      buffPercent: s.buffPercent ? Number(s.buffPercent) : undefined,
      buffTurns: s.buffTurns ? Number(s.buffTurns) : undefined,
    };
  });

  return {
    ...data,
    maxHp: data.hp,
    skills,
    ultimateCharge: 0,
    attackBuff: 0,
    defenseBuff: 0,
    buffTurnsLeft: 0,
  };
};

// ============ 图片生成：双 API + 限流 + 可靠性增强 ============

/** 限流器：确保两次请求间至少间隔 minIntervalMs */
class RateLimiter {
  private lastCall = 0;
  constructor(private minIntervalMs: number) {}
  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastCall = Date.now();
  }
}

// 全局限流器，避免并发请求触发 pollinations 的频率限制
const globalLimiter = new RateLimiter(1200);

/**
 * 预加载图片，校验是否真的可访问且有效。
 * 关键：检查 naturalWidth > 0，因为空响应也会触发 onload。
 */
export const preloadImage = (url: string, timeoutMs = 30000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => {
      // 必须检查 naturalWidth，空图片/损坏图片 naturalWidth 为 0
      finish(img.naturalWidth > 0 && img.naturalHeight > 0);
    };
    img.onerror = () => finish(false);
    img.src = url;
    setTimeout(() => finish(false), timeoutMs);
  });
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

/**
 * 生成角色头像
 * P1 使用 flux 模型，P2 使用 turbo 模型
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
  const seed = Math.floor(Math.random() * 1_000_000);
  const model = modelOverride ?? (player === 1 ? 'flux' : 'turbo');
  await globalLimiter.wait();
  return buildPollinationsUrl(enriched, 384, 384, seed, model);
};

/**
 * 生成大招图片：根据 ultimateType 直接返回本地预设类型图路径
 * 不再调用远程图片 API，避免大招生成的不确定性与等待时间
 */
export const generateUltimateImage = async (
  _cfg: AIConfig,
  ultimateType: string,
  _player?: 1 | 2,
  _modelOverride?: string,
): Promise<string> => {
  return getUltimateTypeById(ultimateType)?.imageUrl ?? getUltimateTypeById(ULTIMATE_TYPE_IDS[0])?.imageUrl ?? '';
};
