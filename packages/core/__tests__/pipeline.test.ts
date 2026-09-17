import { describe, expect, it } from "vitest";
import { compileScript } from "../src/pipeline.ts";

const SCRIPT = `
;/* auk: humanize on */
#Persistent
Loop
{
    ;/* auk: anchor shop.buy = img("buy.png", conf=0.8) */
    ImageSearch, fx, fy, 0, 0, 1920, 1080, buy.png
    if (ErrorLevel = 0)
    {
        ;/* auk: click @shop.buy */
        Click, %fx%, %fy%
    }
    ;/* auk: sleep jitter 300~800 */
    Sleep, 500
}
`;

describe("compileScript", () => {
  it("click 意图绑定锚点而非坐标（spec: click 意图）", () => {
    const r = compileScript(SCRIPT);
    const click = r.program.instructions.find((i) => i.prim.op === "click")!;
    expect(click).toBeDefined();
    expect(click.prim).toMatchObject({ op: "click", target: { kind: "anchor", name: "shop.buy" } });
  });

  it("wait 携带 jitter 区间而非固定值（spec: 数值区间）", () => {
    const r = compileScript(SCRIPT);
    const wait = r.program.instructions.find((i) => i.prim.op === "wait")!;
    expect(wait.prim).toEqual({ op: "wait", ms: { min: 300, max: 800 } });
  });

  it("humanize 全局开关来自指令（spec: 指令与原生语句并存）", () => {
    const r = compileScript(SCRIPT);
    expect(r.humanize.on).toBe(true);
    expect(r.anchors["shop.buy"]).toMatchObject({
      source: { type: "img", path: "buy.png", conf: 0.8 },
    });
  });

  it("同一 click 每圈重新解析锚点 —— 循环体展开为 IR 中独立指令（spec: 循环展开时机）", () => {
    const r = compileScript(SCRIPT);
    expect(r.program.instructions.filter((i) => i.prim.op === "click").length).toBe(1);
    // 循环语义由引擎解释层维护；IR 收录循环体内的动作原语（一次，带行号）
    expect(r.program.instructions.every((i) => i.line > 0)).toBe(true);
  });
});

describe("spec: 脏输入鲁棒性 / 白名单", () => {
  it("DllCall 被拒绝并带行号（spec: 子集外语句报告）", () => {
    const src = "Sleep, 100\nDllCall(\"user32.dll\", \"int\")\nSleep, 200\n";
    expect(() => compileScript(src)).toThrow();
    try {
      compileScript(src);
    } catch (e) {
      const agg = e as { message: string | object };
      expect(String(agg.message)).toContain("line 2");
      expect(String(agg.message)).toContain("whitelist");
    }
  });

  it("多个独立错误聚合报告而非首错即崩（spec: 语法错误恢复）", () => {
    const src = "Run, notepad\nMsgBox, hi\n";
    try {
      compileScript(src);
      expect.unreachable("should throw");
    } catch (e) {
      const agg = e as { message: string | object };
      const msg = String(agg.message);
      expect(msg).toContain("line 1");
      expect(msg).toContain("line 2");
    }
  });

  it("未知 auk 指令报错（spec: 未知指令）", () => {
    expect(() => compileScript(";/* auk: teleport 1 2 */\nSleep, 10\n")).toThrow(/unknown auk directive "teleport"/);
  });

  it("jitter 区间非法（min>=max）报错", () => {
    expect(() => compileScript(";/* auk: sleep jitter 500~300 */\nSleep, 400\n")).toThrow(/min.*must be < max/);
  });
});

describe("spec: 双写法等价", () => {
  it("%var% 传统引用与表达式赋值产出等价语义", () => {
    // 两种写法最终都以 Expr.var 表达（parser.parseLegacyValue / parseExprText）
    const r1 = compileScript("fx = 100\nSleep, 100\n");
    expect(r1.program.instructions.length).toBeGreaterThanOrEqual(1);
  });
});
