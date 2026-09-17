/**
 * AHK v1 子集词法分析（行式）。
 *
 * 白名单（spec ahk-frontend）：Click/MouseClick/MouseMove、Sleep、
 * ImageSearch/PixelSearch/PixelGetColor、Send/SendInput、WinActive/WinWait、
 * Loop/While/If/Break、#IfWinActive 热键、变量赋值与 %var%/表达式引用。
 */

export type TokenKind =
  | "command" // 行首语句名（Click / Sleep / Loop ...）
  | "comma"
  | "number"
  | "string" // "literal"
  | "raw" // 未分类原文（表达式、变量名、文件名等）
  | "varref" // %var%
  | "exprvar" // 表达式中的裸变量
  | "lbrace"
  | "rbrace"
  | "directive" // #IfWinActive
  | "hotkey" // f1::
  | "label" // label:
  | "comment"; // ; 行注释（含 ;/* auk: */ 指令注释）

export interface Token {
  kind: TokenKind;
  text: string;
  line: number; // 1-based
  column: number; // 1-based
}

export interface LexedLine {
  line: number;
  indent: number;
  tokens: Token[];
  /** 行首 `;` 注释原文（可能含 auk 指令） */
  comment?: string;
}

const COMMANDS = new Set([
  "click", "mouseclick", "mousemove", "mouseclickdrag",
  "sleep",
  "imagesearch", "pixelsearch", "pixelgetcolor",
  "send", "sendinput", "sendraw", "sendmode",
  "winactive", "winwait", "winwaitclose",
  "loop", "while", "if", "else", "break", "continue", "return", "exit",
  "setworkingdir", "setworkingdir%", "persistent", "random",
]);

const DIRECTIVES = new Set(["#ifwinactive", "#ifwinexist", "#singleinstance", "#persistent"]);

export function lex(source: string): LexedLine[] {
  const lines: LexedLine[] = [];
  const srcLines = source.split(/\r?\n/);
  for (let i = 0; i < srcLines.length; i++) {
    const raw = srcLines[i]!;
    const lineNo = i + 1;
    const trimmedStart = raw.length - raw.replace(/^[ \t]+/, "").length;
    const text = raw.trim();
    if (text === "") continue;

    // 行注释（AHK: 空白后的 `;` 为注释；`;/*` 是我们约定指令注释）
    let comment: string | undefined;
    let body = text;
    const semi = body.search(/(^|\s);/);
    if (semi >= 0) {
      // ;; 不把 "..." 字符串内的 ; 误切（简化处理：仅当行内引号数为偶数时才切）
      const head = body.slice(0, semi);
      if ((head.match(/"/g)?.length ?? 0) % 2 === 0) {
        comment = body.slice(semi).replace(/^\s*;\s?/, "");
        body = head.trimEnd();
      }
    }
    if (body === "" && comment !== undefined) {
      lines.push({ line: lineNo, indent: trimmedStart, tokens: [], comment });
      continue;
    }

    const tokens: Token[] = [];
    const push = (kind: TokenKind, text: string, col: number) =>
      tokens.push({ kind, text, line: lineNo, column: col });

    // 块括号独占或行内
    if (body === "{") {
      push("lbrace", "{", trimmedStart + 1);
    } else if (body === "}") {
      push("rbrace", "}", trimmedStart + 1);
    } else if (DIRECTIVES.has(body.split(/[,\s]/, 1)[0]!.toLowerCase())) {
      const m = /^(\S+)(.*)$/.exec(body)!;
      push("directive", m[1]!, trimmedStart + 1);
      splitArgs(m[2]!, lineNo).forEach((t) => push("raw", t.text, t.col));
    } else if (/^[^^!+#]*[a-z0-9]+::/i.test(body) && !body.includes(" ")) {
      push("hotkey", body, trimmedStart + 1);
    } else if (/^[a-z0-9_-]+:$/i.test(body)) {
      push("label", body, trimmedStart + 1);
    } else {
      // 语句行：首词 + 参数（无参数的裸语句如 Loop / Break / return）
      const m = /^(\S+?)(?:\s*,\s*|\s+)(.*)$/.exec(body);
      if (!m) {
        push("command", body.toLowerCase(), trimmedStart + 1);
      } else {
        const firstWord = m[1]!;
        const rest = m[2]!;
        const lower = firstWord.toLowerCase();
        if (COMMANDS.has(lower)) {
          push("command", lower, trimmedStart + 1);
          splitArgs(rest, lineNo).forEach((t) => {
            if (/^-?\d+(\.\d+)?$/.test(t.text)) push("number", t.text, t.col);
            else if (/^".*"$/.test(t.text)) push("string", t.text, t.col);
            else if (/^%[a-z_][a-z0-9_]*%$/i.test(t.text)) push("varref", t.text, t.col);
            else push("raw", t.text, t.col);
          });
        } else {
          // 赋值（var = value / var := expr）—— 按语句化处理
          push("raw", body, trimmedStart + 1);
        }
      }
    }
    lines.push({ line: lineNo, indent: trimmedStart, tokens, comment });
  }
  return lines;
}

/** 按逗号切参数（引号内逗号不切；转义 `,,` 归一为 `,`） */
function splitArgs(rest: string, line: number): { text: string; col: number }[] {
  const out: { text: string; col: number }[] = [];
  let cur = "";
  let startCol = 1;
  let inQuote = false;
  let col = 1;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i]!;
    if (ch === '"') inQuote = !inQuote;
    if (ch === "," && !inQuote) {
      const text = cur.trim().replace(/,,/g, ",");
      if (text) out.push({ text, col: startCol });
      cur = "";
      startCol = col + 1;
    } else {
      cur += ch;
    }
    col++;
  }
  const text = cur.trim().replace(/,,/g, ",");
  if (text) out.push({ text, col: startCol });
  return out;
}
