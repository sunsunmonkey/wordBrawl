// 流式 JSON 解析助手：在 AI 流式输出过程中，从尚未结束的 JSON 文本里
// 尽力抽出某个字段当前的可见内容，用于在前端实时显示"正在生成"的文本。

const unescapeJsonString = (raw: string): string => {
  let result = "";
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      switch (next) {
        case '"':
          result += '"';
          i += 2;
          break;
        case "\\":
          result += "\\";
          i += 2;
          break;
        case "/":
          result += "/";
          i += 2;
          break;
        case "b":
          result += "\b";
          i += 2;
          break;
        case "f":
          result += "\f";
          i += 2;
          break;
        case "n":
          result += "\n";
          i += 2;
          break;
        case "r":
          result += "\r";
          i += 2;
          break;
        case "t":
          result += "\t";
          i += 2;
          break;
        case "u": {
          const hex = raw.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            result += String.fromCharCode(parseInt(hex, 16));
            i += 6;
          } else {
            result += next;
            i += 2;
          }
          break;
        }
        default:
          result += next;
          i += 2;
      }
    } else {
      result += ch;
      i++;
    }
  }
  return result;
};

const escapeFieldName = (name: string): string =>
  name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 从尚未结束的 JSON 文本中尽力抽取某个字符串字段当前的值。
 * 如果字段还没开始或者字符串还没出现，返回空串。
 */
export const extractPartialStringField = (
  raw: string,
  fieldName: string,
): string => {
  const re = new RegExp(
    `"${escapeFieldName(fieldName)}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`,
  );
  const match = raw.match(re);
  if (!match) return "";
  return unescapeJsonString(match[1]);
};

/**
 * 与 extractPartialStringField 相同，但同时返回该字段字符串是否已经闭合
 * （即模型已经写完收尾引号）。用于识别 reply 已经流完、后面只剩 JSON 尾部字段。
 */
export const extractPartialStringFieldWithStatus = (
  raw: string,
  fieldName: string,
): { value: string; isComplete: boolean } => {
  const re = new RegExp(
    `"${escapeFieldName(fieldName)}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)("?)`,
  );
  const match = raw.match(re);
  if (!match) return { value: "", isComplete: false };
  return {
    value: unescapeJsonString(match[1]),
    isComplete: match[2] === '"',
  };
};

/**
 * 从尚未结束的 JSON 文本中尽力抽取某个数组字段里已经写出的对象。
 * itemParser 接收单个对象的原始字符串（不含外层花括号）以及该对象是否已经结束。
 */
export const extractPartialArrayObjects = <T>(
  raw: string,
  fieldName: string,
  itemParser: (objContent: string, isComplete: boolean) => T | null,
): T[] => {
  const re = new RegExp(`"${escapeFieldName(fieldName)}"\\s*:\\s*\\[`);
  const startMatch = raw.match(re);
  if (!startMatch || startMatch.index === undefined) return [];

  const arrayStart = startMatch.index + startMatch[0].length;
  const items: T[] = [];
  let pos = arrayStart;

  while (pos < raw.length) {
    while (pos < raw.length && /[\s,]/.test(raw[pos])) pos++;
    if (pos >= raw.length) break;
    if (raw[pos] === "]") break;
    if (raw[pos] !== "{") break;

    let depth = 1;
    let objEnd = pos + 1;
    let isComplete = false;

    while (objEnd < raw.length) {
      const ch = raw[objEnd];
      if (ch === '"') {
        objEnd++;
        while (objEnd < raw.length) {
          if (raw[objEnd] === "\\") {
            objEnd += 2;
            continue;
          }
          if (raw[objEnd] === '"') break;
          objEnd++;
        }
        if (objEnd >= raw.length) break;
        objEnd++;
        continue;
      }
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          objEnd++;
          isComplete = true;
          break;
        }
      }
      objEnd++;
    }

    const objStr = raw.slice(pos, objEnd);
    const innerContent = objStr.replace(/^\{/, "").replace(/\}$/, "");
    const item = itemParser(innerContent, isComplete);
    if (item) items.push(item);

    pos = objEnd;
    if (!isComplete) break;
  }

  return items;
};

/**
 * 判断流式累积的原始文本是否看起来像 JSON（而不是 AI 直接吐出的纯文本）。
 * 用于决定是按字段抽取还是直接当纯文本展示。
 */
export const looksLikeJsonStart = (raw: string): boolean => {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "");
  return trimmed.startsWith("{");
};
