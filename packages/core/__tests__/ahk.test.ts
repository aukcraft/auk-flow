import { describe, expect, it } from "vitest";
import { lex } from "../src/ahk/lexer.ts";
import { parse } from "../src/ahk/parser.ts";
import { ErrorBag } from "../src/ahk/errors.ts";
import { parseDirective } from "../src/ahk/directives.ts";

describe("lexer（spec ahk-frontend）", () => {
  it("白名单语句解析为 command + 参数 token", () => {
    const lines = lex("Click, 100, 200\nSleep, 500");
    expect(lines).toHaveLength(2);
    expect(lines[0]!.tokens[0]).toMatchObject({ kind: "command", text: "click" });
    expect(lines[0]!.tokens[1]).toMatchObject({ kind: "number", text: "100" });
    expect(lines[1]!.tokens[0]).toMatchObject({ kind: "command", text: "sleep" });
  });

  it("%var% 识别为 varref", () => {
    const lines = lex("Click, %fx%, %fy%");
    expect(lines[0]!.tokens[1]).toMatchObject({ kind: "varref", text: "%fx%" });
  });

  it("; 注释剥离且保留原文（指令提取用）", () => {
    const lines = lex(';/* auk: humanize on */\nSend, "abc" ; trailing');
    expect(lines[0]!.comment).toBe("/* auk: humanize on */");
    expect(lines[0]!.tokens).toHaveLength(0);
    expect(lines[1]!.comment).toBe("trailing");
  });

  it("引号内逗号不切分", () => {
    const lines = lex('Send, "a,b"');
    expect(lines[0]!.tokens).toHaveLength(2);
  });

  it("热键行识别", () => {
    const lines = lex("F1::\nF2::return");
    expect(lines[0]!.tokens[0]!.kind).toBe("hotkey");
    expect(lines[1]!.tokens[0]!.kind).toBe("hotkey");
  });
});

describe("parser（spec: 双写法等价）", () => {
  it("%var% 传统赋值与表达式赋值产出等价 Expr.var", () => {
    const legacy = parse(lex("fx = %gx%"), new ErrorBag());
    const expr = parse(lex("fx := gx"), new ErrorBag());
    const l = legacy.stmts[0]!;
    const e = expr.stmts[0]!;
    expect(l).toMatchObject({ type: "assign", name: "fx", value: { type: "var", name: "gx" } });
    expect(e).toMatchObject({ type: "assign", name: "fx", value: { type: "var", name: "gx" } });
  });

  it("Loop 块与 If 块嵌套解析", () => {
    const src = [
      "Loop, 10",
      "{",
      "  if (ErrorLevel = 0)",
      "  {",
      "    Click, 5, 6",
      "  }",
      "  Sleep, 100",
      "}",
    ].join("\n");
    const ast = parse(lex(src), new ErrorBag());
    const loop = ast.stmts[0]!;
    expect(loop.type).toBe("loop");
    if (loop.type === "loop") {
      expect(loop.body).toHaveLength(2);
      expect(loop.body[0]!.type).toBe("if");
      expect(loop.body[1]!.type).toBe("sleep");
    }
  });

  it("ImageSearch 参数齐全解析", () => {
    const ast = parse(lex("ImageSearch, ox, oy, 0, 0, 1920, 1080, img.png"), new ErrorBag());
    expect(ast.stmts[0]).toMatchObject({
      type: "imagesearch",
      outX: "ox",
      outY: "oy",
      file: { type: "raw", text: "img.png" },
    });
  });

  it("缺右括号报告 eof 错误不崩溃", () => {
    const bag = new ErrorBag();
    parse(lex("Loop\n{\nSleep, 10"), bag);
    expect(bag.ok).toBe(false);
    expect(bag.items[0]!.message).toContain("missing closing '}'");
  });
});

describe("指令解析（spec: 注释指令提取）", () => {
  it("五类合法指令全部可解析", () => {
    expect(parseDirective("/* auk: humanize on */", 1)).toEqual({ kind: "humanize", on: true });
    expect(parseDirective("/* auk: humanize off */", 1)).toEqual({ kind: "humanize", on: false });
    expect(parseDirective("/* auk: humanize profile age=45-60 style=calm */", 1)).toEqual({
      kind: "humanize-profile",
      age: "45-60",
      style: "calm",
    });
    expect(parseDirective('/* auk: anchor a.b = img("x.png", conf=0.9) */', 1)).toEqual({
      kind: "anchor",
      name: "a.b",
      source: { type: "img", path: "x.png", conf: 0.9 },
    });
    expect(parseDirective('/* auk: anchor s = selector(".buy") */', 1)).toEqual({
      kind: "anchor",
      name: "s",
      source: { type: "selector", css: ".buy" },
    });
    expect(parseDirective("/* auk: click @shop.buy */", 1)).toEqual({ kind: "click", anchor: "shop.buy" });
    expect(parseDirective("/* auk: sleep jitter 300~800 */", 1)).toEqual({
      kind: "sleep-jitter",
      minMs: 300,
      maxMs: 800,
    });
  });

  it("非 auk 注释返回 null（保持 AHK 合法性）", () => {
    expect(parseDirective("just a comment", 1)).toBeNull();
    expect(parseDirective("/* not-auk: x */", 1)).toBeNull();
  });

  it("脚本可移植：指令注释行不产出任何语句 token（spec: 脚本可移植）", () => {
    const lines = lex(";/* auk: click @shop.buy */\nClick, 10, 10");
    expect(lines[0]!.tokens).toHaveLength(0); // 纯注释 → 真 AHK 亦合法
    expect(parse(lines, new ErrorBag()).stmts).toHaveLength(1);
  });
});
