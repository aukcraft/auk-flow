/**
 * AHK v1 子集 → AST。
 *
 * 白名单语句见 lexer.COMMANDS；白名单外语句（如 DllCall）必须拒绝并带行号
 * （spec: 子集外语句报告）。支持 %var% 传统引用与表达式赋值两种写法产出
 * 等价 AST（spec: 双写法等价）。
 */

import type { LexedLine } from "./lexer.ts";
import { ErrorBag, ParseError } from "./errors.ts";

// ---------- AST ----------

export type Expr =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "var"; name: string } // %var% 或表达式中的裸变量（等价）
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "raw"; text: string };

export type Stmt =
  | { type: "click"; line: number; x?: Expr; y?: Expr; which?: Expr }
  | { type: "mousemove"; line: number; x: Expr; y: Expr }
  | { type: "sleep"; line: number; ms: Expr }
  | { type: "send"; line: number; text: Expr }
  | { type: "imagesearch"; line: number; outX: string; outY: string; file: Expr }
  | { type: "winwait"; line: number; title: Expr }
  | { type: "assign"; line: number; name: string; value: Expr } // var := expr / var = value
  | { type: "if"; line: number; cond: Expr; then: Stmt[]; else?: Stmt[] }
  | { type: "loop"; line: number; count?: Expr; body: Stmt[] }
  | { type: "while"; line: number; cond: Expr; body: Stmt[] }
  | { type: "hotkey"; line: number; key: string; body: Stmt[] }
  | { type: "break"; line: number }
  | { type: "return"; line: number };

export interface AhkProgram {
  stmts: Stmt[];
}

// ---------- 解析 ----------

const REJECT = new Set([
  "dllcall", "run", "msgbox", "filedelete", "fileread", "fileappend",
  "urldownloadtofile", "process", "comobject", "winclose", "winkill",
  "controlclick", "postmessage", "sendmessage", "settimer",
]);

export function parse(lines: LexedLine[], errors: ErrorBag = new ErrorBag()): AhkProgram {
  const ctx = new ParseCtx(lines, errors);
  const stmts = ctx.parseBlock(null);
  return { stmts };
}

class ParseCtx {
  pos = 0;
  constructor(
    private lines: LexedLine[],
    private errors: ErrorBag,
  ) {}

  private peek(): LexedLine | undefined {
    return this.lines[this.pos];
  }

  private next(): LexedLine | undefined {
    return this.lines[this.pos++];
  }

  /** 解析语句块，直到终止符（"rbrace" 或热键块结束时 EOF） */
  parseBlock(terminator: "rbrace" | null): Stmt[] {
    const stmts: Stmt[] = [];
    for (;;) {
      const cur = this.peek();
      if (cur === undefined) {
        if (terminator === "rbrace") {
          this.errors.add(new ParseError(0, 1, "<eof>", "missing closing '}'"));
        }
        return stmts;
      }
      if (terminator === "rbrace" && cur.tokens[0]?.kind === "rbrace") {
        this.next();
        return stmts;
      }
      const stmt = this.parseStmt();
      if (stmt) stmts.push(stmt);
    }
  }

  private parseStmt(): Stmt | null {
    const line = this.next()!;
    const t0 = line.tokens[0];
    if (t0 === undefined) return null; // 纯注释行已由指令提取处理

    switch (t0.kind) {
      case "rbrace":
        this.errors.add(new ParseError(line.line, t0.column, "}", "unexpected '}'"));
        return null;
      case "directive":
        return null; // #IfWinActive 等预处理指令：v1 忽略（热键过滤后续接）
      case "hotkey": {
        const body = this.parseBlock(null); // 简化：热键体到 EOF 或下一个独占块
        return { type: "hotkey", line: line.line, key: normalizeHotkey(t0.text), body };
      }
      case "command": {
        const args = line.tokens.slice(1);
        return this.parseCommand(t0.text, args, line.line);
      }
      case "raw": {
        // 赋值：name = value / name := expr
        const text = t0.text;
        let m = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:=\s*(.+)$/.exec(text);
        if (m) return { type: "assign", line: line.line, name: m[1]!, value: parseExprText(m[2]!, line.line) };
        m = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/.exec(text);
        if (m) {
          // 传统赋值：右侧整体为字面文本（%var% 展开由 Expr.var 表达）
          return { type: "assign", line: line.line, name: m[1]!, value: this.parseLegacyValue(m[2] ?? "", line.line) };
        }
        m = /^\((.+)\)$/.exec(text);
        if (m) {
          this.errors.add(new ParseError(line.line, t0.column, text, "bare expressions must follow If/While"));
          return null;
        }
        // 语句名不在白名单 → 拒绝并报行号
        const word = text.split(/[\s(,]/, 1)[0]!.replace(/^\^|^!|^\+/g, "");
        if (REJECT.has(word.toLowerCase())) {
          this.errors.add(new ParseError(line.line, t0.column, word, `statement "${word}" is not in the AHK whitelist (security policy)`));
        } else {
          this.errors.add(new ParseError(line.line, t0.column, word, `unrecognized statement "${word}"`));
        }
        return null;
      }
      default:
        this.errors.add(new ParseError(line.line, t0.column, t0.text, `unexpected token kind "${t0.kind}"`));
        return null;
    }
  }

  private parseCommand(name: string, args: TokenView[], line: number): Stmt | null {
    const a = (i: number): Expr | undefined =>
      args[i] ? tokenToExpr(args[i]!, line) : undefined;

    switch (name) {
      case "click":
      case "mouseclick": {
        // Click, x, y  或 Click, %fx%, %fy%
        if (args.length >= 2) {
          return { type: "click", line, x: a(0), y: a(1) };
        }
        if (args.length === 1) return { type: "click", line, x: undefined, y: a(0) };
        return { type: "click", line };
      }
      case "mousemove":
        return { type: "mousemove", line, x: a(0)!, y: a(1)! };
      case "sleep":
        return { type: "sleep", line, ms: a(0)! };
      case "send":
      case "sendinput":
      case "sendraw":
        return { type: "send", line, text: a(0)! };
      case "imagesearch": {
        // ImageSearch, outX, outY, x1, y1, x2, y2, file
        if (args.length < 7) {
          this.errors.add(new ParseError(line, 1, "ImageSearch", "ImageSearch requires outX, outY, x1, y1, x2, y2, file"));
          return null;
        }
        const outX = varName(args[0]!, line);
        const outY = varName(args[1]!, line);
        return { type: "imagesearch", line, outX, outY, file: a(6)! };
      }
      case "winactive":
      case "winwait": {
        const t = a(0);
        if (t) return { type: "winwait", line, title: t };
        this.errors.add(new ParseError(line, 1, name, `${name} requires a window title`));
        return null;
      }
      case "if": {
        // If (expr) { ... } / If (expr) 单行
        const condText = args.map((t) => t.text).join(" ").replace(/^\(|\)$/g, "");
        const cond = parseExprText(condText, line);
        return this.parseIfBody(line, cond);
      }
      case "while": {
        const condText = args.map((t) => t.text).join(" ").replace(/^\(|\)$/g, "");
        const cond = parseExprText(condText, line);
        return { type: "while", line, cond, body: this.parseBody() };
      }
      case "loop": {
        const count = args.length ? a(0) : undefined;
        return { type: "loop", line, count, body: this.parseBody() };
      }
      case "break":
        return { type: "break", line };
      case "return":
      case "exit":
        return { type: "return", line };
      case "else":
        return null; // 由 parseIfBody 处理；独立 else 视为噪声并容忍
      default:
        // setworkingdir / persistent / random 等：容忍但忽略（非动作语义）
        return null;
    }
  }

  /** If 的体：同行块或后续 { } 块；支持 else 分支 */
  private parseIfBody(line: number, cond: Expr): Stmt {
    const then = this.parseBody();
    let elseBody: Stmt[] | undefined;
    const nxt = this.peek();
    if (nxt && nxt.tokens[0]?.kind === "command" && nxt.tokens[0].text === "else") {
      this.next();
      elseBody = this.parseBody();
    }
    return elseBody ? { type: "if", line, cond, then, else: elseBody } : { type: "if", line, cond, then };
  }

  private parseBody(): Stmt[] {
    const cur = this.peek();
    if (cur && cur.tokens[0]?.kind === "lbrace") {
      this.next();
      return this.parseBlock("rbrace");
    }
    // 单行体
    const stmt = this.parseStmt();
    return stmt ? [stmt] : [];
  }

  /** 传统赋值右侧：文本中 %var% 段落转为 var 表达式（拼接语义简化为单值） */
  private parseLegacyValue(text: string, line: number): Expr {
    const m = /^%([a-zA-Z_][a-zA-Z0-9_]*)%$/.exec(text.trim());
    if (m) return { type: "var", name: m[1]! };
    if (/^-?\d+(\.\d+)?$/.test(text.trim())) return { type: "num", value: Number(text) };
    return { type: "str", value: text };
  }
}

// ---------- 辅助 ----------

type TokenView = LexedLine["tokens"][number];

function tokenToExpr(t: TokenView, line: number): Expr {
  switch (t.kind) {
    case "number":
      return { type: "num", value: Number(t.text) };
    case "string":
      return { type: "str", value: t.text.slice(1, -1) };
    case "varref":
      return { type: "var", name: t.text.slice(1, -1) };
    default:
      return parseExprText(t.text, line);
  }
}

/** 极简表达式解析：二元比较/算术 + 数字 + 裸变量 */
export function parseExprText(text: string, line: number): Expr {
  const t = text.trim();
  if (t === "") return { type: "raw", text: "" };
  for (const op of ["<=", ">=", "!=", "=", "<", ">", "+", "-", "*", "/"]) {
    const idx = findTopLevelOp(t, op);
    if (idx > 0) {
      const left = parseExprText(t.slice(0, idx), line);
      const right = parseExprText(t.slice(idx + op.length), line);
      if (left.type !== "raw" || right.type !== "raw") {
        return { type: "binary", op: op === "=" ? "==" : op, left, right };
      }
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) return { type: "num", value: Number(t) };
  if (/^".*"$/.test(t)) return { type: "str", value: t.slice(1, -1) };
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) return { type: "var", name: t };
  return { type: "raw", text: t };
}

function findTopLevelOp(text: string, op: string): number {
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') inQuote = !inQuote;
    if (!inQuote && text.startsWith(op, i)) {
      // 跳过 %var% 内部与负号
      if (op === "-" && /[\w%]$/.test(text[i - 1] ?? "") === false) continue;
      return i;
    }
  }
  return -1;
}

function varName(t: TokenView, line: number): string {
  const m = /^%?([a-zA-Z_][a-zA-Z0-9_]*)%?$/.exec(t.text);
  if (!m) throw new ParseError(line, t.column, t.text, "expected variable name");
  return m[1]!;
}

function normalizeHotkey(text: string): string {
  return text.replace(/::$/, "").replace(/^[^a-z0-9]+/i, "");
}
