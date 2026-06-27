import type { CharacterData } from "../store/useGameStore";
import type {
  ActiveEvolutionStage,
  RosterCharacter,
} from "../store/useRosterStore";
import { generateEvolutionImage, probeImage, type AIConfig } from "./ai";
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

type TaskState = {
  promise: Promise<EvolutionPrefetchPayload | null>;
  startedAt: number;
};

const TASK_MAX_AGE_MS = 1000 * 60 * 60;
// 全局 Pollinations 串行队列已保证“同一时刻仅 1 个网络请求在飞行”，
// 这里只需一个很小的间隔避免任务排布过密，真正的并发控制交给全局队列。
const QUEUE_START_GAP_MS = 1_000;

const tasks = new Map<string, TaskState>();
const canceledKeys = new Set<string>();
let queueTail: Promise<void> = Promise.resolve();
let lastQueueStart = 0;

export const cleanupEvolutionPrefetchCache = () => {
  for (const [key, task] of tasks) {
    if (Date.now() - task.startedAt > TASK_MAX_AGE_MS) {
      tasks.delete(key);
    }
  }
};

export const buildEvolutionPrefetchKey = (
  rosterId: string,
  stage: ActiveEvolutionStage,
): string => `${rosterId}:${stage}`;

export const clearEvolutionPrefetchForRoster = (rosterId: string) => {
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
  cfg?: AIConfig,
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
    cfg,
  );
};

export const startEvolutionAssetPrefetch = (
  request: EvolutionAssetPrefetchRequest,
  buildEvolve: () => Promise<EvolveResult>,
  cfg?: AIConfig,
): Promise<EvolutionPrefetchPayload | null> => {
  cleanupEvolutionPrefetchCache();
  const key = buildEvolutionPrefetchKey(request.rosterId, request.stage);
  const active = tasks.get(key);
  if (active) return active.promise;
  canceledKeys.delete(key);

  const promise = enqueuePrefetch(async () => {
    const evo = await buildEvolve();
    const avatarUrl = await resolveEvolutionAvatar(request, evo, cfg);
    if (!avatarUrl) {
      throw new Error("进化形态图生成失败");
    }

    const payload: EvolutionPrefetchPayload = {
      key,
      rosterId: request.rosterId,
      stage: request.stage,
      level: request.level,
      layer: request.layer,
      evo,
      avatarUrl,
      ultimateImageUrl: undefined,
      createdAt: Date.now(),
    };
    return payload;
  })
    .catch(() => {
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
  void level;
  void layer;
  const key = buildEvolutionPrefetchKey(rosterId, stage);
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
  cfg?: AIConfig,
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
        cfg,
      }),
    384,
  );
};
