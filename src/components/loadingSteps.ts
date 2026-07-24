import {
  Brain,
  Flame,
  ImageIcon,
  Scroll,
  Fingerprint,
} from "lucide-react";

export interface LoadingStep {
  icon: React.ElementType;
  text: string;
  detail: string;
}

export const LOADING_STEPS: LoadingStep[] = [
  {
    icon: Brain,
    text: "解析灵魂语料",
    detail: "从描述中提取角色原型与气质",
  },
  {
    icon: Fingerprint,
    text: "铭刻战斗参数",
    detail: "生成攻击、防御、生命与速度",
  },
  {
    icon: Scroll,
    text: "编织技能体系",
    detail: "构造普攻、技能与终极奥义",
  },
  {
    icon: Flame,
    text: "凝聚大招形态",
    detail: "为终极技能赋予视觉与效果",
  },
  {
    icon: ImageIcon,
    text: "召唤实体形象",
    detail: "将词灵具现为可视化立绘",
  },
];
