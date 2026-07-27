import { extractPartialStringFieldWithStatus } from "./jsonStream";

const stripLeadingJsonFence = (raw: string): string =>
  raw.trim().replace(/^```(?:json)?\s*/i, "");

export const looksLikeStructuredAiOutput = (raw: string): boolean => {
  const trimmed = raw.trim();
  const unfenced = stripLeadingJsonFence(raw);
  return (
    /^```(?:json)?/i.test(trimmed) ||
    /^[{[]/.test(unfenced) ||
    /[{[]\s*(?:"|$)/.test(unfenced) ||
    /"(?:reply|turns|participantStates|storySummary|mood|bond)"\s*:/i.test(
      unfenced,
    ) ||
    /\bjson\b\s*[:：]/i.test(trimmed)
  );
};

const cleanDialogueText = (raw: string, maxLength: number): string =>
  raw
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .slice(0, maxLength);

/**
 * 只从模型的结构化响应中取指定文本字段；协议本身绝不作为聊天内容显示。
 */
export const getSafeAiField = (
  raw: string,
  fieldName: string,
  fallback: string,
  maxLength: number,
): string => {
  const { value } = extractPartialStringFieldWithStatus(raw, fieldName);
  if (value) {
    const text = cleanDialogueText(value, maxLength);
    if (text && !looksLikeStructuredAiOutput(text)) return text;
  }

  const text = cleanDialogueText(raw, maxLength);
  return looksLikeStructuredAiOutput(text) ? fallback : text || fallback;
};

/**
 * 流式阶段仅在确认是普通文本，或已解析到目标字段后才回传给 UI。
 */
export const getSafeAiStreamField = (
  raw: string,
  fieldName: string,
  maxLength: number,
): { value: string; isComplete: boolean } | null => {
  const field = extractPartialStringFieldWithStatus(raw, fieldName);
  if (field.value) {
    const value = cleanDialogueText(field.value, maxLength);
    if (value && !looksLikeStructuredAiOutput(value)) {
      return { value, isComplete: field.isComplete };
    }
    return null;
  }

  if (looksLikeStructuredAiOutput(raw)) return null;
  const value = cleanDialogueText(raw, maxLength);
  return value ? { value, isComplete: false } : null;
};
