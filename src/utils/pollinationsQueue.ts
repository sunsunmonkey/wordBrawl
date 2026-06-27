/**
 * Pollinations 匿名层限制：同一 IP 同时只允许 1 个图片请求在飞行中（队列上限 max=1）。
 * 这不是“频率限制”，而是“并发限制”——只要上一个请求还没真正结束，下一个就会被拒为 429。
 *
 * 因此这里用“串行互斥队列”而非固定间隔限流器：
 * - 同一时刻只放行 1 个任务，下一个任务必须等上一个**真正完成**（探测/下载结束）后才开始；
 * - 任务之间留一个小缓冲，给服务端清空 IP 队列的时间；
 * - 429 退避重试由各生成函数在自己的槽位内完成（持有槽位期间不会有第二个请求并发）。
 */
class SerialQueue {
  private tail: Promise<void> = Promise.resolve();
  private lastFinished = 0;

  constructor(private bufferMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const elapsed = Date.now() - this.lastFinished;
      if (elapsed < this.bufferMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.bufferMs - elapsed),
        );
      }
      try {
        return await task();
      } finally {
        this.lastFinished = Date.now();
      }
    });
    // 无论成功失败，都让队列继续流动，避免一个失败任务卡死后续。
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

const pollinationsQueue = new SerialQueue(1_500);

/** 把一个 Pollinations 网络任务放进全局串行队列，保证同一时刻只有一个请求在飞行中。 */
export const runPollinationsTask = <T>(task: () => Promise<T>): Promise<T> =>
  pollinationsQueue.run(task);

/** 是否是 Pollinations 图片域名（仅这些请求需要串行化）。 */
export const isPollinationsUrl = (url: string): boolean =>
  url.includes("image.pollinations.ai");

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
