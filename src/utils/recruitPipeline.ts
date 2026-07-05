import {
  generateCharacter,
  generateCharacterImage,
  type AIConfig,
} from "./ai";
import { cacheImageUrlAsDataUrl } from "./localImage";
import { startEvolutionAssetPrefetch } from "./evolutionPrefetch";
import { buildLocalEvolution } from "./towerProgress";
import { useRosterStore } from "../store/useRosterStore";

const loadGeneratedAvatar = async (
  generator: () => Promise<string>,
): Promise<string> => {
  const url = await generator();
  if (!url) {
    throw new Error("头像生成正在排队或被限流，请稍后重试。");
  }
  return url;
};

export const runBackgroundRecruit = (
  rosterId: string,
  sourceDescription: string,
  cfg: AIConfig,
) => {
  void (async () => {
    const { completePendingRecruit, failPendingRecruit } =
      useRosterStore.getState();
    try {
      const charData = await generateCharacter(cfg, sourceDescription);
      const avatarUrl = await loadGeneratedAvatar(() =>
        generateCharacterImage(
          cfg,
          charData.imagePrompt || sourceDescription,
          1,
        ),
      );
      charData.imageUrl =
        (await cacheImageUrlAsDataUrl(avatarUrl, { maxSize: 512 })) ||
        avatarUrl;
      charData.sourceDescription = sourceDescription;

      const recruited = completePendingRecruit(
        rosterId,
        charData,
        sourceDescription,
      );
      if (!recruited) return;

      try {
        await startEvolutionAssetPrefetch(
          {
            rosterId: recruited.rosterId,
            characterName: recruited.name,
            stage: 1,
            level: 5,
            layer: 1,
          },
          async () => buildLocalEvolution(recruited, 1),
          cfg,
        );
      } catch (prefetchErr) {
        console.warn("recruit stage1 prefetch failed", prefetchErr);
      }
    } catch (err: unknown) {
      failPendingRecruit(
        rosterId,
        err instanceof Error
          ? err.message
          : "生成失败，请检查 API Key 或网络连接",
      );
    }
  })();
};
