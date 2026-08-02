import { generateCharacter, generateCharacterImage, type AIConfig } from "./ai";
import { cacheImageUrlAsDataUrl } from "./localImage";
import { startEvolutionAssetPrefetch } from "./evolutionPrefetch";
import { buildLocalEvolution } from "./towerProgress";
import { useRosterStore, RECRUIT_STAGE_COUNT } from "../store/useRosterStore";

const loadGeneratedAvatar = async (
  generator: () => Promise<string>,
): Promise<string> => {
  const url = await generator();
  if (!url) {
    throw new Error("头像生成正在排队或被限流，请稍后重试。");
  }
  return url;
};

/**
 * 文本生成期间无法真正拆步骤，只能"看起来在推进"。
 * 用一个匀速计时器，把 stage 从 0 平滑推到 IMAGE_STAGE-1（=3），
 * 到达图片阶段后由 pipeline 手动 setStage(IMAGE_STAGE)。
 */
const startFakeTextProgress = (rosterId: string): (() => void) => {
  const setStage = useRosterStore.getState().updateRecruitStage;
  const maxTextStage = RECRUIT_STAGE_COUNT - 2; // 3
  setStage(rosterId, 0);
  let step = 0;
  const timer = window.setInterval(() => {
    step += 1;
    if (step > maxTextStage) return;
    setStage(rosterId, step);
  }, 1600);
  return () => window.clearInterval(timer);
};

export const runBackgroundRecruit = (
  rosterId: string,
  sourceDescription: string,
  cfg: AIConfig,
) => {
  void (async () => {
    const { completePendingRecruit, failPendingRecruit, updateRecruitStage } =
      useRosterStore.getState();
    const stopTextProgress = startFakeTextProgress(rosterId);
    try {
      const charData = await generateCharacter(cfg, sourceDescription);
      stopTextProgress();
      // 进入图像阶段：最后一步进度
      updateRecruitStage(rosterId, RECRUIT_STAGE_COUNT - 1);

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
      stopTextProgress();
      failPendingRecruit(
        rosterId,
        err instanceof Error
          ? err.message
          : "生成失败，请检查 API Key 或网络连接",
      );
    }
  })();
};
