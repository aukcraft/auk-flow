import { describe, expect, it } from "vitest";
import { ageGate, auditCorpus, cleanTrial } from "../src/data/corpus.ts";

const GOOD = [
  JSON.stringify({ points: [[0, 1, 2], [16, 3, 4], [40, 5, 6]], dist: 100, angle: 45, duration: 40, age_band: "26-35", device: "mouse" }),
  JSON.stringify({ points: [[0, 1, 2], [16, 3, 4], [50, 5, 6]], dist: 220, angle: 90, duration: 50 }),
].join("\n");

describe("语料审计（spec data-collection: 匿名格式）", () => {
  it("合法语料通过", () => {
    const r = auditCorpus(GOOD);
    expect(r.ok).toBe(true);
    expect(r.totalTrials).toBe(2);
  });

  it("白名单外字段（指纹风险）审计失败", () => {
    const bad = JSON.stringify({ points: [[0, 1, 2], [16, 3, 4], [40, 5, 6]], user_id: "abc123" });
    const r = auditCorpus(bad);
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.reason).toContain("user_id");
  });

  it("精确年龄被拒绝（只允许区间）", () => {
    const bad = JSON.stringify({ points: [[0, 1, 2], [16, 3, 4], [40, 5, 6]], age_band: "34" });
    expect(auditCorpus(bad).ok).toBe(false);
    const bad2 = JSON.stringify({ points: [[0, 1, 2], [16, 3, 4], [40, 5, 6]], age_band: "2001-03-02" });
    expect(auditCorpus(bad2).ok).toBe(false);
  });

  it("畸形 JSON 与 points 报告行号", () => {
    const r = auditCorpus(GOOD + "\n{oops");
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.line).toBe(3);
  });
});

describe("脏数据剔除（spec: 停顿>2s 切段、过短剔除）", () => {
  it("含 3 秒停顿的 trial 被切段", () => {
    const trial = {
      points: [[0, 1, 1], [100, 2, 2], [200, 3, 3], [3400, 4, 4], [3500, 5, 5], [3600, 6, 6]] as [number, number, number][],
      dist: 100, angle: 0, duration: 3600,
    };
    const segs = cleanTrial(trial);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.points).toHaveLength(3);
    expect(segs[1]!.points[0]![0]).toBe(0); // 切段后相对时间重置
  });

  it("过短 trial 剔除（<40ms 或 <3 点）", () => {
    expect(cleanTrial({ points: [[0, 1, 1], [10, 2, 2], [20, 3, 3]], dist: 10, angle: 0, duration: 20 })).toHaveLength(0);
    expect(cleanTrial({ points: [[0, 1, 1]], dist: 10, angle: 0, duration: 0 })).toHaveLength(0);
  });
});

describe("年龄门（spec: 14 岁以下不采集）", () => {
  it("13 岁拒绝、14 岁放行、未声明放行", () => {
    expect(ageGate(13).allowed).toBe(false);
    expect(ageGate(14).allowed).toBe(true);
    expect(ageGate(null).allowed).toBe(true);
  });
});
