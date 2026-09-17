/**
 * AST → 意图 IR 编译（spec intent-ir）。
 *
 * - 数值区间来自 `sleep jitter` 指令
 * - click 的目标解析优先级：`click @name` 注释指令 > 数值坐标
 * - 每条 IR 指令携带 AHK 行号溯源
 */

import type { AhkProgram, Expr, Stmt } from "../ahk/parser.ts";
import type { AukDirective } from "../ahk/directives.ts";
import type {
  HumanizeConfig,
  IrInstruction,
  IrProgram,
  IrPrimitive,
  Interval,
  Target,
} from "./types.ts";

export interface CompileResult {
  program: IrProgram;
  humanize: HumanizeConfig;
  /** anchor 声明表（运行时每次回放前重新解析 —— spec 三层坐标） */
  anchors: Record<string, AukDirective extends never ? never : AnchorDecl>;
}

export interface AnchorDecl {
  name: string;
  source: { type: "img"; path: string; conf: number } | { type: "selector"; css: string };
}

export interface CompileInput {
  ast: AhkProgram;
  /** 按行号索引的 auk 指令 */
  directivesByLine: Map<number, AukDirective>;
}

export function compile({ ast, directivesByLine }: CompileInput): CompileResult {
  const instructions: IrInstruction[] = [];
  const anchors: Record<string, AnchorDecl> = {};
  const humanize: HumanizeConfig = { on: false };

  // 收集 anchor 声明与 humanize 全局开关（作用于整个程序）
  for (const d of directivesByLine.values()) {
    if (d.kind === "humanize") humanize.on = d.on;
    else if (d.kind === "humanize-profile") humanize.profile = { age: d.age, style: d.style };
    else if (d.kind === "anchor") anchors[d.name] = { name: d.name, source: d.source };
  }

  const emit = (prim: IrPrimitive, line: number) => instructions.push({ prim, line });

  const lastJitter = new Map<number, Interval>();
  for (const [line, d] of directivesByLine) {
    if (d.kind === "sleep-jitter") lastJitter.set(line, { min: d.minMs, max: d.maxMs });
  }

  const clickDirectiveFor = (line: number): string | undefined => {
    const d = directivesByLine.get(line);
    return d?.kind === "click" ? d.anchor : undefined;
  };

  const walk = (stmts: Stmt[]): void => {
    for (const s of stmts) {
      switch (s.type) {
        case "click": {
          const anchorName = clickDirectiveFor(s.line);
          let target: Target;
          if (anchorName) {
            target = { kind: "anchor", name: anchorName };
          } else if (s.x !== undefined && s.y !== undefined) {
            const p = exprPoint(s.x, s.y);
            if (!p) continue; // 变量坐标无法编译期定值 → 依赖锚点指令，跳过兜底
            target = p;
          } else {
            continue;
          }
          emit({ op: "click", target }, s.line);
          break;
        }
        case "mousemove": {
          const p = exprPoint(s.x, s.y);
          if (p) emit({ op: "move", target: p }, s.line);
          break;
        }
        case "sleep": {
          const jitter = lastJitter.get(s.line);
          const ms = exprNum(s.ms);
          if (jitter) emit({ op: "wait", ms: jitter }, s.line);
          else if (ms !== undefined) emit({ op: "wait", ms }, s.line);
          break;
        }
        case "send": {
          if (s.text.type === "str") emit({ op: "type", text: s.text.value }, s.line);
          else if (s.text.type === "raw") emit({ op: "type", text: s.text.text }, s.line);
          break;
        }
        case "imagesearch":
        case "winwait":
        case "assign":
        case "if":
        case "loop":
        case "while":
        case "break":
        case "return":
        case "hotkey":
          // 感知/控制流在 v1 由引擎解释层处理；IR 收录动作原语
          if (s.type === "loop" || s.type === "while" || s.type === "hotkey") walk(s.body);
          if (s.type === "if") {
            walk(s.then);
            if (s.else) walk(s.else);
          }
          break;
      }
    }
  };

  walk(ast.stmts);
  return {
    program: { instructions, combos: {} },
    humanize,
    anchors,
  };
}

function exprNum(e: Expr): number | undefined {
  return e.type === "num" ? e.value : undefined;
}

function exprPoint(x: Expr, y: Expr): Target | undefined {
  const xv = exprNum(x), yv = exprNum(y);
  return xv !== undefined && yv !== undefined ? { kind: "point", x: xv, y: yv } : undefined;
}
