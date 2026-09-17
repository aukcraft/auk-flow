/**
 * 锚点运行时解析接口（spec intent-ir）。
 * 锚点解析在每次回放/迭代前重新执行（窗口可移动）；失效按等待策略处理。
 * 引擎侧（Rust anchor 模块）为实现，本接口是 core → engine 的边界契约。
 */

import type { AnchorDecl } from "./compile.ts";
import type { PhysicalPoint, ScreenTransform } from "./coords.ts";

export interface AnchorHit extends PhysicalPoint {
  confidence: number;
}

export interface AnchorResolver {
  /** img 锚定：截屏 + 模板匹配（引擎实现） */
  locateImage(path: string, conf: number): Promise<AnchorHit | null>;
  /** 窗口存在性（WinActive/WinWait 语义） */
  windowOrigin(title: string): Promise<ScreenTransform | null>;
}

export type WaitStrategy = { kind: "fail-fast" } | { kind: "wait"; timeoutMs: number; intervalMs: number };

export class AnchorResolveError extends Error {
  constructor(
    public readonly anchorName: string,
    public readonly reason: "not-found" | "timeout" | "unsupported",
  ) {
    super(`anchor "${anchorName}" ${reason}`);
    this.name = "AnchorResolveError";
  }
}

/**
 * 解析一个锚点声明到物理坐标。命中即返回；未命中按等待策略重试；
 * 最终失败抛错（引擎转为 state(reason=stuck/timeout) 事件）。
 */
export async function resolveAnchor(
  decl: AnchorDecl,
  resolver: AnchorResolver,
  strategy: WaitStrategy = { kind: "fail-fast" },
): Promise<AnchorHit> {
  const attempt = (): Promise<AnchorHit | null> =>
    decl.source.type === "img"
      ? resolver.locateImage(decl.source.path, decl.source.conf)
      : Promise.reject(new AnchorResolveError(decl.name, "unsupported")); // selector 为 v2 DOM 锚定

  const first = await attempt().catch((e) => {
    if (e instanceof AnchorResolveError) throw e;
    return null;
  });
  if (first && first.confidence >= 0) return first;

  if (strategy.kind === "fail-fast") {
    throw new AnchorResolveError(decl.name, "not-found");
  }
  const deadline = Date.now() + strategy.timeoutMs;
  for (;;) {
    if (Date.now() >= deadline) throw new AnchorResolveError(decl.name, "timeout");
    await sleep(strategy.intervalMs);
    const hit = await attempt().catch(() => null);
    if (hit) return hit;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
