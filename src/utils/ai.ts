import OpenAI from 'openai';
import { CharacterData } from '../store/useGameStore';

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
用户会输入一段角色描述，你需要根据这段描述，为角色生成游戏数值和技能。
你的返回必须是合法的、可被 JSON.parse 解析的纯 JSON 对象，绝对不要包含 markdown 代码块、注释或额外文字说明。
JSON 结构如下：
{
  "name": "角色名称（根据描述提取或生成一个响亮的名字）",
  "hp": 200,
  "attack": 25,
  "defense": 15,
  "speed": 50,
  "skills": [
    { "name": "普通攻击", "description": "基础的攻击动作", "damageMultiplier": 1.0 },
    { "name": "专属技能名称", "description": "根据用户描述生成的华丽技能", "damageMultiplier": 1.5 }
  ],
  "imagePrompt": "用于生成头像的英文提示词，pixel art 或 cyberpunk 风格"
}
数值范围要求：hp 100-500，attack 10-50，defense 5-30，speed 1-100，专属技能 damageMultiplier 在 1.2 到 2.5 之间。`;

  const response = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: description }
    ],
    temperature: 0.9,
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

  return {
    ...data,
    maxHp: data.hp,
  };
};

export const generateCharacterImage = async (_cfg: AIConfig, prompt: string): Promise<string> => {
  if (!prompt) return '';
  const cleaned = prompt.slice(0, 400);
  const enriched = `${cleaned}, neon cyberpunk character portrait, glowing rim light, dark moody background, ultra detailed, vivid colors, dramatic lighting, anime style`;
  const seed = Math.floor(Math.random() * 1_000_000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched)}?width=512&height=512&seed=${seed}&nologo=true&model=flux`;
};
