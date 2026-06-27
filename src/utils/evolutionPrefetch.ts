import type { CharacterData } from "../store/useGameStore";
import type {
  ActiveEvolutionStage,
  RosterCharacter,
} from "../store/useRosterStore";
import { generateEvolutionImage, probeImage } from "./ai";
import { cacheImageUrlAsDataUrl } from "./localImage";
import { type BattleSummary, type EvolveResult } from "./towerAnalysis";
import { applyXp, xpForLayer } from "./towerProgress";
import { getPresetEvolutionLocalPath } from "../data/presetCharacters";

export interface EvolutionPrefetchContext {
  rosterId: string;
  layer: number;
  result: "win" | "loss";
  character: RosterCharacter;
  summary: BattleSummary;
}

export interface EvolutionPrefetchPayload {
  key: string;
  rosterId: string;
  stage: ActiveEvolutionStage;
  level: number;
  layer: number;
  evo: EvolveResult;
  avatarUrl?: string;
  ultimateImageUrl?: string;
  createdAt: number;
}

interface EvolutionAssetPrefetchRequest {
  rosterId: string;
  characterName?: string;
  stage: ActiveEvolutionStage;
  level: number;
  layer: number;
}

type PrefetchRecord = EvolutionPrefetchPayload & {
  status: "ready" | "failed";
  error?: string;
};

type TaskState = {
  promise: Promise<EvolutionPrefetchPayload | null>;
  startedAt: number;
};

const STORAGE_KEY = "word-brawl-evolution-prefetch-v1";
const MAX_RECORDS = 8;
const MAX_RECORD_AGE_MS = 1000 * 60 * 60 * 6;
// 全局 Pollinations 串行队列已保证“同一时刻仅 1 个网络请求在飞行”，
// 这里只需一个很小的间隔避免任务排布过密，真正的并发控制交给全局队列。
const QUEUE_START_GAP_MS = 1_000;

const tasks = new Map<string, TaskState>();
const canceledKeys = new Set<string>();
let queueTail: Promise<void> = Promise.resolve();
let lastQueueStart = 0;

const clampStage = (value: unknown): ActiveEvolutionStage | null => {
  return value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6
    ? value
    : null;
};

const isBrowser = (): boolean =>
  typeof window !== "undefined" && !!window.localStorage;

const readRecords = (): PrefetchRecord[] => {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((entry): entry is PrefetchRecord => {
        if (!entry || typeof entry !== "object") return false;
        const record = entry as PrefetchRecord;
        return (
          typeof record.key === "string" &&
          typeof record.rosterId === "string" &&
          !!clampStage(record.stage) &&
          typeof record.createdAt === "number" &&
          now - record.createdAt < MAX_RECORD_AGE_MS
        );
      })
      .slice(-MAX_RECORDS);
  } catch {
    return [];
  }
};

const writeRecords = (records: PrefetchRecord[]) => {
  if (!isBrowser()) return;
  try {
    const now = Date.now();
    const fresh = records
      .filter((record) => now - record.createdAt < MAX_RECORD_AGE_MS)
      .slice(-MAX_RECORDS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // Image data URLs can exceed storage quota. Drop oldest records and keep the app responsive.
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(records.slice(-2)),
      );
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
};

const upsertRecord = (record: PrefetchRecord) => {
  const records = readRecords().filter((entry) => entry.key !== record.key);
  writeRecords([...records, record]);
};

export const cleanupEvolutionPrefetchCache = () => {
  writeRecords(readRecords());
  for (const [key, task] of tasks) {
    if (Date.now() - task.startedAt > MAX_RECORD_AGE_MS) {
      tasks.delete(key);
    }
  }
};

export const buildEvolutionPrefetchKey = (
  rosterId: string,
  stage: ActiveEvolutionStage,
  level: number,
  layer: number,
): string => `${rosterId}:${stage}:${level}:${layer}`;

export const getEvolutionPrefetchRecord = (
  rosterId: string,
  stage: ActiveEvolutionStage,
  level: number,
  layer: number,
): EvolutionPrefetchPayload | null => {
  cleanupEvolutionPrefetchCache();
  const key = buildEvolutionPrefetchKey(rosterId, stage, level, layer);
  const record = readRecords().find(
    (entry) => entry.key === key && entry.status === "ready",
  );
  return record ? toPayload(record) : null;
};

export const consumeEvolutionPrefetchRecord = (
  rosterId: string,
  stage: ActiveEvolutionStage,
  level: number,
  layer: number,
): EvolutionPrefetchPayload | null => {
  cleanupEvolutionPrefetchCache();
  const key = buildEvolutionPrefetchKey(rosterId, stage, level, layer);
  const records = readRecords();
  const record = records.find(
    (entry) => entry.key === key && entry.status === "ready",
  );
  writeRecords(records.filter((entry) => entry.key !== key));
  return record ? toPayload(record) : null;
};

export const clearEvolutionPrefetchForRoster = (rosterId: string) => {
  writeRecords(readRecords().filter((entry) => entry.rosterId !== rosterId));
  for (const key of tasks.keys()) {
    if (key.startsWith(`${rosterId}:`)) {
      canceledKeys.add(key);
      tasks.delete(key);
    }
  }
};

export const getPendingEvolutionFromBattle = (
  character: RosterCharacter,
  summary: BattleSummary,
  layer: number,
  result: "win" | "loss",
): {
  stage: ActiveEvolutionStage;
  level: number;
  character: RosterCharacter;
} | null => {
  const hpRatio = getHpRatioAfterBattle(character, summary);
  const xpDelta = xpForLayer(layer, result, hpRatio);
  const xpResult = applyXp(character, xpDelta);
  if (!xpResult.triggeredEvolution) return null;
  const triggerEvent = xpResult.events.find(
    (event) => event.evolutionStage === xpResult.triggeredEvolution,
  );
  return {
    stage: xpResult.triggeredEvolution,
    level: triggerEvent?.newLevel ?? xpResult.character.level,
    character: xpResult.character,
  };
};

export const startEvolutionPrefetch = (
  context: EvolutionPrefetchContext,
  buildEvolve: (
    character: CharacterData,
    summary: BattleSummary,
    stage: ActiveEvolutionStage,
  ) => Promise<EvolveResult>,
): Promise<EvolutionPrefetchPayload | null> => {
  cleanupEvolutionPrefetchCache();
  const pending = getPendingEvolutionFromBattle(
    context.character,
    context.summary,
    context.layer,
    context.result,
  );
  if (!pending) return Promise.resolve(null);

  return startEvolutionAssetPrefetch(
    {
      rosterId: context.rosterId,
      characterName: context.character.name,
      stage: pending.stage,
      level: pending.level,
      layer: context.layer,
    },
    () => buildEvolve(pending.character, context.summary, pending.stage),
  );
};

export const startEvolutionAssetPrefetch = (
  request: EvolutionAssetPrefetchRequest,
  buildEvolve: () => Promise<EvolveResult>,
): Promise<EvolutionPrefetchPayload | null> => {
  cleanupEvolutionPrefetchCache();
  const key = buildEvolutionPrefetchKey(
    request.rosterId,
    request.stage,
    request.level,
    request.layer,
  );
  const cached = getEvolutionPrefetchRecord(
    request.rosterId,
    request.stage,
    request.level,
    request.layer,
  );
  if (cached) return Promise.resolve(cached);
  const active = tasks.get(key);
  if (active) return active.promise;
  canceledKeys.delete(key);

  const promise = enqueuePrefetch(async () => {
    const evo = await buildEvolve();
    const avatarUrl = await resolveEvolutionAvatar(request, evo);
    if (!avatarUrl) {
      throw new Error("进化形态图生成失败");
    }

    const payload: EvolutionPrefetchPayload = {
      key,
      rosterId: request.rosterId,
      stage: request.stage,
      level: request.level,
      layer: request.layer,
      evo: {
        ...evo,
        newUltimate: evo.newUltimate
          ? { ...evo.newUltimate, imageUrl: undefined }
          : evo.newUltimate,
      },
      avatarUrl,
      ultimateImageUrl: undefined,
      createdAt: Date.now(),
    };
    if (!canceledKeys.has(key)) {
      upsertRecord({ ...payload, status: "ready" });
    }
    return payload;
  })
    .catch((error) => {
      if (!canceledKeys.has(key)) {
        upsertRecord({
          key,
          rosterId: request.rosterId,
          stage: request.stage,
          level: request.level,
          layer: request.layer,
          evo: { imagePrompt: "", lore: "" },
          createdAt: Date.now(),
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    })
    .finally(() => {
      tasks.delete(key);
    });

  tasks.set(key, { promise, startedAt: Date.now() });
  return promise;
};

export const waitEvolutionPrefetch = (
  rosterId: string,
  stage: ActiveEvolutionStage,
  level: number,
  layer: number,
): Promise<EvolutionPrefetchPayload | null> | null => {
  const key = buildEvolutionPrefetchKey(rosterId, stage, level, layer);
  return tasks.get(key)?.promise ?? null;
};

const getHpRatioAfterBattle = (
  character: RosterCharacter,
  summary: BattleSummary,
): number => {
  if (character.maxHp <= 0) return 0;
  if (summary.damageTaken >= character.maxHp) return 0;
  return Math.max(0, 1 - summary.damageTaken / character.maxHp);
};

const enqueuePrefetch = <T>(runner: () => Promise<T>): Promise<T> => {
  const run = queueTail.then(async () => {
    const elapsed = Date.now() - lastQueueStart;
    if (elapsed < QUEUE_START_GAP_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, QUEUE_START_GAP_MS - elapsed),
      );
    }
    lastQueueStart = Date.now();
    return runner();
  });
  queueTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

const cacheGeneratedImage = async (
  buildUrl: () => Promise<string>,
  maxSize: number,
): Promise<string | undefined> => {
  const remote = await buildUrl();
  if (!remote) return undefined;
  const cached = await cacheImageUrlAsDataUrl(remote, { maxSize });
  return cached || remote;
};

/**
 * 解析一次进化头像 URL。
 * - 预设角色优先使用 public/presets/evolutions/ 下的本地预下载图，命中即返回路径（运行时零网络）。
 * - 未命中或非预设角色，再退回 Pollinations 串行队列生成。
 */
const resolveEvolutionAvatar = async (
  request: EvolutionAssetPrefetchRequest,
  evo: EvolveResult,
): Promise<string | undefined> => {
  const name = request.characterName;
  if (name) {
    const localPath = getPresetEvolutionLocalPath(name, request.stage);
    if (localPath) {
      const exists = await probeImage(localPath, 4_000);
      if (exists.ok) return localPath;
    }
  }
  return cacheGeneratedImage(
    () =>
      generateEvolutionImage(evo.imagePrompt, {
        seedSalt: `${request.rosterId}:${request.stage}`,
      }),
    384,
  );
};

const toPayload = (record: PrefetchRecord): EvolutionPrefetchPayload => ({
  key: record.key,
  rosterId: record.rosterId,
  stage: record.stage,
  level: record.level,
  layer: record.layer,
  evo: record.evo,
  avatarUrl: record.avatarUrl,
  ultimateImageUrl: record.ultimateImageUrl,
  createdAt: record.createdAt,
});
