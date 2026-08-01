import {
  asRecord,
  clamp,
  clampNumber,
  consumeUsage,
  fetchAiCompletionWithRetry,
  getAiCredentials,
  getUsageStatus,
  parseJsonLoose,
  readBody,
  sendJson,
  setCorsHeaders,
  type ApiRequest,
  type ApiResponse,
} from "./_shared.js";

const ULTIMATE_TYPE_IDS = [
  "fire",
  "ice",
  "shadow",
  "lightning",
  "cosmic",
  "nature",
  "mecha",
  "holy",
] as const;

const RARITY_CONFIGS = {
  N: { label: "普通", dropRate: 0.3 },
  R: { label: "稀有", dropRate: 0.32 },
  SR: { label: "超稀有", dropRate: 0.22 },
  SSR: { label: "史诗", dropRate: 0.11 },
  UR: { label: "传说", dropRate: 0.05 },
} as const;

type Rarity = keyof typeof RARITY_CONFIGS;

const MAX_JSON_GENERATION_ATTEMPTS = 3;

const RARITY_GENERATION_GUIDES: Record<Rarity, string> = {
  N: "普通档。角色应当可用但克制：只保留一个清晰优势，必须有明显短板；不必满足通用高阶数值要求，禁止多项高数值或极限爆发。",
  R: "稀有档。角色应有一个突出的核心能力和鲜明玩法，但仍要保留可被针对的短板。",
  SR: "超稀有档。角色应有一到两个强项，并让技能体系产生明确协同；仍必须通过短板维持克制关系。",
  SSR: "史诗档。角色应具备高强度核心玩法、优秀技能联动和有记忆点的大招，但不能成为无短板的全能角色。",
  UR: "传说档。角色可以拥有极具统治力的定位、顶级视觉演出和强协同技能组，但必须保留一个可利用的战术弱点。",
};

const rollRarity = (): Rarity => {
  const rand = Math.random();
  let cumulative = 0;
  const rarities: Rarity[] = ["UR", "SSR", "SR", "R", "N"];

  for (const rarity of rarities) {
    cumulative += RARITY_CONFIGS[rarity].dropRate;
    if (rand <= cumulative) return rarity;
  }
  return "N";
};

const buildRarityInstruction = (rarity: Rarity): string =>
  `本次稀有度已由系统预先抽定为 ${rarity}（${RARITY_CONFIGS[rarity].label}）。此档位不可修改，且优先级高于下方通用数值建议。${RARITY_GENERATION_GUIDES[rarity]} 数值与技能设计必须符合该档位。`;

const systemPrompt = `你是一个充满创意的游戏角色设计大师。
用户会输入一段角色描述，你需要根据这段描述，为角色生成游戏数值和【丰富多样的技能体系】。
你的返回必须是合法的、可被 JSON.parse 解析的纯 JSON 对象，绝对不要包含 markdown 代码块、注释或额外文字说明。
重要：所有 JSON key 和字符串必须使用英文半角双引号 "，禁止使用中文弯引号 “ ” 或单引号。
语言要求（强制）：所有会展示给玩家的文本必须使用简体中文，包括 name、全部 skills 的 name 和 description，以及 spiritProfile 的全部文本字段。禁止输出英文角色名、英文技能名或英文技能描述。
唯一例外：JSON key、type / ultimateType 等枚举 ID，以及用于生成头像的 imagePrompt 必须保持英文。

技能体系要求（必须包含 4-5 个技能）：
1. 一个普通攻击（type="attack"，damageMultiplier 1.0）
2. 一个强力攻击技能（type="attack"，damageMultiplier 1.7-3.2）
3. 一个治疗或增益技能（type="heal" 或 "buff"）
   - heal: healPercent 18-55（按 maxHp 百分比回血）
   - buff: buffPercent 25-95（攻击或防御提升百分比），buffTurns 2-4
4. 一个减益技能（type="debuff"，buffPercent 25-80 削弱对方，buffTurns 2-4）
5. 一个终极技能/大招（type="ultimate"，isUltimate=true，damageMultiplier 4.4-8.5）
   - 大招必须有 description 字段：详细描述释放时的华丽特效
   - 大招必须有 ultimateType 字段：从以下类型中挑选一个最贴合角色主题的 ID
     可选类型：${ULTIMATE_TYPE_IDS.join(", ")}
   - 例如火焰类角色选 "fire"，冰霜类选 "ice"，机甲类选 "mecha"，宇宙类选 "cosmic"

数值分层要求：
- 先判断角色定位：玻璃大炮、重装坦克、极速刺客、均衡战士、回复消耗、控制削弱、低速 Boss 等。
- 每个角色只能有 1-2 个顶级强项，必须有至少 1 个明显短板。不要生成没有弱点的六边形角色。
- 顶级攻击或顶级速度角色通常要低 HP/低 defense；高 HP/高 defense 角色通常要低 speed 或较低 attack。
- 不要把角色做成“全都偏弱”。除非用户明确描述为弱小/新手/残破，必须至少让一个核心数值进入高阶区间：hp >= 720，或 attack >= 105，或 defense >= 68，或 speed >= 112。
- 允许并鼓励极端分布：玻璃炮 attack 125-170 但 defense 0-22；重装坦克 hp 760-1100/defense 70-110 但 speed 1-38；极速刺客 speed 120-160/attack 95-145 但 hp 100-360；低速 Boss hp 850-1100/attack 100-150 但 speed 1-25。
- 均衡角色也不应平庸：通常总要有一个 90+ 的攻击/速度，或 600+ HP，另配一个清晰短板。
- 强力攻击技能倍率要按定位分层：坦克 1.7-2.35，均衡角色 2.2-2.75，玻璃炮/刺客 2.75-3.2。
- 大招倍率也要分层：坦克/消耗型 4.4-6.2，均衡强者 6.0-7.2，玻璃炮/脆皮爆发 7.2-8.5。

词灵人格卡要求：
- 必须生成 spiritProfile。所有字段紧扣用户输入，不要使用泛用模板。
- slogan 是卡牌背面的专属一句话：8-24 个中文字符，必须只属于这个角色，不要复用泛用战斗口号。

JSON 结构如下：
{
  "name": "角色名称（根据描述提取或生成一个响亮的名字）",
  "hp": 620,
  "attack": 96,
  "defense": 42,
  "speed": 88,
  "skills": [
    { "name": "普通攻击", "description": "基础攻击", "damageMultiplier": 1.0, "type": "attack" },
    { "name": "专属攻击技能名", "description": "技能描述", "damageMultiplier": 2.6, "type": "attack" },
    { "name": "治疗技能名", "description": "技能描述", "damageMultiplier": 0, "type": "heal", "healPercent": 35 },
    { "name": "增益技能名", "description": "技能描述", "damageMultiplier": 0, "type": "buff", "buffPercent": 60, "buffTurns": 3 },
    { "name": "减益技能名", "description": "技能描述", "damageMultiplier": 0.8, "type": "debuff", "buffPercent": 45, "buffTurns": 3 },
    { "name": "大招名称（要霸气）", "description": "详细的华丽特效描述", "damageMultiplier": 6.8, "type": "ultimate", "isUltimate": true, "ultimateType": "fire" }
  ],
  "spiritProfile": {
    "archetype": "词灵原型",
    "temperament": "性格底色",
    "speechStyle": "说话方式",
    "slogan": "卡牌背面展示的专属一句话",
    "catchphrases": ["短台词1", "短台词2", "短台词3"],
    "battleCry": "关键出招或大招前的宣言",
    "victoryLine": "胜利时说的话",
    "defeatLine": "失败时说的话",
    "worldAnchors": ["世界观锚点1", "世界观锚点2"],
    "memorySeeds": ["长期执念或未完成目标"]
  },
  "imagePrompt": "用于生成头像的英文提示词，pixel art 或 cyberpunk 风格"
}
数值范围要求：hp 100-1100，attack 15-170，defense 0-110，speed 1-160。请根据角色设定拉开差距，不要所有角色都给中庸数值；玻璃大炮、重装坦克、极速刺客、低速 Boss 都可以很极端。强角色可以真的强，但必须用另一个低项换取平衡。
技能名称和描述要紧扣用户输入的角色主题，要有创意、有画面感、有中二气息。`;

const normalizeText = (
  value: unknown,
  fallback: string,
  maxLength: number,
): string => {
  const text = String(value || "")
    .trim()
    .slice(0, maxLength);
  return text || fallback;
};

const normalizeTextList = (
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] =>
  Array.isArray(value)
    ? value
        .map((item) =>
          String(item || "")
            .trim()
            .slice(0, maxLength),
        )
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const normalizeSpiritProfile = (value: unknown) => {
  const profile = asRecord(value);
  if (Object.keys(profile).length === 0) return undefined;

  return {
    archetype: normalizeText(profile.archetype, "未明词灵", 32),
    temperament: normalizeText(profile.temperament, "冷静而好战", 36),
    speechStyle: normalizeText(profile.speechStyle, "短促、有画面感", 48),
    slogan: normalizeText(profile.slogan, "", 48),
    catchphrases: normalizeTextList(profile.catchphrases, 4, 32),
    battleCry: normalizeText(profile.battleCry, "", 48),
    victoryLine: normalizeText(profile.victoryLine, "", 48),
    defeatLine: normalizeText(profile.defeatLine, "", 48),
    worldAnchors: normalizeTextList(profile.worldAnchors, 4, 48),
    memorySeeds: normalizeTextList(profile.memorySeeds, 4, 48),
  };
};

const normalizeCharacter = (value: unknown) => {
  const data = asRecord(value);
  const hp = clamp(data.hp, 100, 1100, 320);
  const skills = Array.isArray(data.skills) ? data.skills : [];
  const spiritProfile = normalizeSpiritProfile(data.spiritProfile);

  return {
    name: String(data.name || "无名斗士").slice(0, 24),
    hp,
    maxHp: hp,
    attack: clamp(data.attack, 15, 170, 62),
    defense: clamp(data.defense, 0, 110, 30),
    speed: clamp(data.speed, 1, 160, 65),
    imagePrompt: String(
      data.imagePrompt || "cyberpunk game character portrait",
    ).slice(0, 240),
    skills: skills.slice(0, 6).map((skillValue, index: number) => {
      const skill = asRecord(skillValue);
      const rawType = String(skill.type || "attack");
      const type = ["attack", "heal", "buff", "debuff", "ultimate"].includes(
        rawType,
      )
        ? rawType
        : "attack";
      const isUltimate = Boolean(skill.isUltimate) || type === "ultimate";
      const requestedUltimateType = String(skill.ultimateType || "");
      const ultimateType =
        isUltimate &&
        ULTIMATE_TYPE_IDS.includes(
          requestedUltimateType as (typeof ULTIMATE_TYPE_IDS)[number],
        )
          ? requestedUltimateType
          : isUltimate
            ? ULTIMATE_TYPE_IDS[0]
            : undefined;

      return {
        name: String(skill.name || `技能 ${index + 1}`).slice(0, 32),
        description: String(skill.description || "").slice(0, 240),
        damageMultiplier: clampNumber(
          skill.damageMultiplier,
          0,
          isUltimate ? 8.8 : 3.5,
          isUltimate ? 6.2 : 1,
        ),
        type,
        isUltimate,
        ultimateType,
        healPercent: skill.healPercent
          ? clamp(skill.healPercent, 1, 70, 35)
          : undefined,
        buffPercent: skill.buffPercent
          ? clamp(skill.buffPercent, 1, 120, 45)
          : undefined,
        buffTurns: skill.buffTurns
          ? clamp(skill.buffTurns, 1, 6, 3)
          : undefined,
      };
    }),
    ultimateCharge: 0,
    attackBuff: 0,
    defenseBuff: 0,
    buffTurnsLeft: 0,
    ...(spiritProfile ? { spiritProfile } : {}),
  };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    const credentials = getAiCredentials();
    sendJson(res, 200, {
      ok: true,
      usage: await getUsageStatus(req),
      model: credentials.model,
    });
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
  const description = String(body.description || "").trim();
  if (!description) {
    sendJson(res, 400, { error: "请先输入角色描述" });
    return;
  }
  if (description.length > 1000) {
    sendJson(res, 400, { error: "角色描述太长了，请控制在 1000 字以内" });
    return;
  }

  const chargedUsage = await consumeUsage(req);
  const rarity = rollRarity();

  try {
    let lastParseError: unknown;

    for (
      let attempt = 1;
      attempt <= MAX_JSON_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      const upstreamResponse = await fetchAiCompletionWithRetry(
        `${baseUrl}/chat/completions`,
        {
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
                content: `${systemPrompt}\n\n${buildRarityInstruction(rarity)}`,
              },
              { role: "user", content: description },
            ],
            temperature: 0.95,
          }),
        },
      );

      const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
      if (!upstreamResponse.ok) {
        console.error(
          "AI upstream error",
          upstreamResponse.status,
          upstreamPayload?.error || upstreamPayload,
        );
        sendJson(res, 502, {
          error:
            upstreamPayload?.error?.message ||
            "大模型接口调用失败，请检查服务端模型配置",
          usage: chargedUsage,
        });
        return;
      }

      const rawContent = upstreamPayload?.choices?.[0]?.message?.content;
      if (!rawContent) {
        sendJson(res, 502, {
          error: "大模型返回内容为空",
          usage: chargedUsage,
        });
        return;
      }

      try {
        const parsed = parseJsonLoose(rawContent);

        sendJson(res, 200, {
          ok: true,
          character: normalizeCharacter(parsed),
          rarity,
          usage: chargedUsage,
        });
        return;
      } catch (parseError) {
        lastParseError = parseError;
        if (attempt < MAX_JSON_GENERATION_ATTEMPTS) {
          console.warn(
            `AI 返回 JSON 解析失败，正在重试（${attempt}/${MAX_JSON_GENERATION_ATTEMPTS}）`,
          );
        }
      }
    }

    sendJson(res, 502, {
      error:
        lastParseError instanceof Error
          ? lastParseError.message
          : "大模型返回的内容不是合法 JSON",
      usage: chargedUsage,
    });
  } catch (error) {
    console.error("generate-character failed", error);
    sendJson(res, 500, {
      error: "角色生成失败，请稍后再试",
      usage: chargedUsage,
    });
  }
}
