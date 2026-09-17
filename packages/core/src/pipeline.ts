/**
 * 端到端管线：AHK 源码 →（lex → 指令提取 → parse）→（compile）→ IR 结果。
 */

import { lex } from "./ahk/lexer.ts";
import { parseDirective, type AukDirective } from "./ahk/directives.ts";
import { parse } from "./ahk/parser.ts";
import { ErrorBag } from "./ahk/errors.ts";
import { compile, type CompileResult } from "./ir/compile.ts";

export interface PipelineResult extends CompileResult {
  /** auk 指令（含行号，面板展示用） */
  directives: { line: number; directive: AukDirective }[];
}

export function compileScript(source: string, errors = new ErrorBag()): PipelineResult {
  const lines = lex(source);

  const directives: { line: number; directive: AukDirective }[] = [];
  const pendingDirectives: { line: number; directive: AukDirective }[] = [];
  for (const l of lines) {
    if (l.comment !== undefined) {
      const d = parseDirective(l.comment, l.line);
      if (d) {
        // 同一对象引用进两个列表：挂到下一实际语句行时同步更新
        const entry = { line: l.line, directive: d };
        directives.push(entry);
        pendingDirectives.push(entry);
      }
    } else if (l.tokens.length > 0 && pendingDirectives.length > 0) {
      for (const p of pendingDirectives) p.line = l.line;
      pendingDirectives.length = 0;
    }
  }

  const ast = parse(lines, errors);
  errors.throwIfAny(); // 指令错误即时抛，语法错误聚合抛

  const directivesByLine = new Map(directives.map((d) => [d.line, d.directive]));
  const result = compile({ ast, directivesByLine });
  return { ...result, directives };
}
