import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRANSFORM,
  ErrorAccumulatingRounder,
  fromNormalized,
  logicalToPhysical,
  toNormalized,
  windowPctToPhysical,
} from "../src/ir/coords.ts";
import {
  AnchorResolveError,
  resolveAnchor,
  type AnchorResolver,
} from "../src/ir/anchors.ts";
import type { AnchorDecl } from "../src/ir/compile.ts";

describe("三层坐标（spec intent-ir）", () => {
  it("DPI 150% 下逻辑像素换算为物理像素（spec: DPI 换算）", () => {
    const t = { ...DEFAULT_TRANSFORM, scaleFactor: 1.5 };
    const p = logicalToPhysical(100, 200, t);
    expect(p).toEqual({ x: 150, y: 300 });
  });

  it("窗口百分比 → 物理像素", () => {
    const p = windowPctToPhysical(50, 25, DEFAULT_TRANSFORM);
    expect(p.x).toBeCloseTo(960);
    expect(p.y).toBeCloseTo(270);
  });

  it("L3 归一化往返误差 ≤1px（spec: L3 归一化往返）", () => {
    for (const [from, to] of [
      [{ x: 0, y: 0 }, { x: 800, y: 600 }],
      [{ x: 812.5, y: 445.25 }, { x: 1344, y: 780 }],
      [{ x: 960, y: 540 }, { x: 961, y: 542 }],
    ] as const) {
      const n = toNormalized(from, to);
      const back = fromNormalized(from, n);
      expect(Math.abs(back.x - to.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.y - to.y)).toBeLessThanOrEqual(1);
    }
  });

  it("误差累积舍入：100 步 0.37px 无系统性偏移", () => {
    const r = new ErrorAccumulatingRounder();
    let accX = 0;
    for (let i = 0; i < 100; i++) {
      accX += r.round(1.37, 0).x;
    }
    expect(Math.abs(accX - 137)).toBeLessThanOrEqual(0.51); // 仅最后一次舍入的残差
  });
});

describe("锚点解析（spec intent-ir）", () => {
  const imgDecl: AnchorDecl = { name: "btn", source: { type: "img", path: "b.png", conf: 0.8 } };

  function resolver(hits: number, hit: { x: number; y: number; confidence: number } | null): AnchorResolver {
    let calls = 0;
    return {
      async locateImage() {
        calls++;
        return calls > hits ? hit : null;
      },
      async windowOrigin() {
        return null;
      },
    };
  }

  it("命中即返回", async () => {
    const hit = await resolveAnchor(imgDecl, resolver(0, { x: 100, y: 50, confidence: 0.9 }));
    expect(hit).toMatchObject({ x: 100, y: 50 });
  });

  it("fail-fast 未命中报 not-found（spec: 锚点失效——不得点 (0,0)）", async () => {
    await expect(
      resolveAnchor(imgDecl, resolver(99, null)),
    ).rejects.toMatchObject({ name: "AnchorResolveError", reason: "not-found" });
  });

  it("wait 策略下重试至命中", async () => {
    const hit = await resolveAnchor(
      imgDecl,
      resolver(2, { x: 10, y: 20, confidence: 0.85 }),
      { kind: "wait", timeoutMs: 1000, intervalMs: 1 },
    );
    expect(hit.x).toBe(10);
  });

  it("selector 锚点在 v1 报 unsupported（DOM 锚定属 v2）", async () => {
    const decl: AnchorDecl = { name: "s", source: { type: "selector", css: ".x" } };
    await expect(resolveAnchor(decl, resolver(0, null))).rejects.toBeInstanceOf(AnchorResolveError);
  });
});
