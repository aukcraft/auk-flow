/**
 * auk 注释指令提取。
 *
 * 注释格式（AHK 行注释 `;` 后跟块注释包裹体）：
 *   /* auk: <指令体> * /（无空格）
 *
 * 指令集 v1（spec ahk-frontend，冻结）：
 *   humanize on|off
 *   humanize profile age=<band> style=<name>
 *   anchor <name> = img("<path>", conf=<n>) | selector("<css>")
 *   click @<name>
 *   sleep jitter <min>~<max>
 */

export type AukDirective =
  | { kind: "humanize"; on: boolean }
  | { kind: "humanize-profile"; age?: string; style?: string }
  | { kind: "anchor"; name: string; source: AnchorSource }
  | { kind: "click"; anchor: string }
  | { kind: "sleep-jitter"; minMs: number; maxMs: number };

export type AnchorSource =
  | { type: "img"; path: string; conf: number }
  | { type: "selector"; css: string };

export class DirectiveError extends Error {
  constructor(
    public readonly line: number,
    message: string,
  ) {
    super(`line ${line} — directive error: ${message}`);
    this.name = "DirectiveError";
  }
}

const AUK_RE = /^\/\*\s*auk:\s*(.+?)\s*\*\/$/; // 匹配: /* auk: ... * /（无空格）

/** 尝试把一条 AHK 注释解析为 auk 指令；非 auk 注释返回 null；格式错误抛 DirectiveError */
export function parseDirective(comment: string, line: number): AukDirective | null {
  const m = AUK_RE.exec(comment.trim());
  if (!m) return null;
  const body = m[1]!.trim();

  // humanize on|off
  let mm = /^humanize\s+(on|off)$/.exec(body);
  if (mm) return { kind: "humanize", on: mm[1] === "on" };

  // humanize profile age=<band> style=<name>
  mm = /^humanize\s+profile\s+(.*)$/.exec(body);
  if (mm) {
    const d: AukDirective = { kind: "humanize-profile" };
    for (const kv of mm[1]!.split(/\s+/)) {
      const [k, v] = kv.split("=", 2) as [string, string | undefined];
      if (k === "age" && v) d.age = v;
      else if (k === "style" && v) d.style = v;
      else throw new DirectiveError(line, `unknown profile key "${kv}"`);
    }
    return d;
  }

  // anchor <name> = img("...", conf=0.8) | selector("...")
  mm = /^anchor\s+([a-z][a-z0-9_.-]*)\s*=\s*(.+)$/i.exec(body);
  if (mm) {
    const name = mm[1]!;
    const src = mm[2]!.trim();
    let sm = /^img\(\s*"([^"]+)"\s*(?:,\s*conf\s*=\s*([\d.]+))?\s*\)$/i.exec(src);
    if (sm) return { kind: "anchor", name, source: { type: "img", path: sm[1]!, conf: sm[2] ? Number(sm[2]) : 0.8 } };
    sm = /^selector\(\s*"([^"]+)"\s*\)$/i.exec(src);
    if (sm) return { kind: "anchor", name, source: { type: "selector", css: sm[1]! } };
    throw new DirectiveError(line, `anchor source must be img(...) or selector(...), got "${src}"`);
  }

  // click @<name>
  mm = /^click\s+@([a-z][a-z0-9_.-]*)$/i.exec(body);
  if (mm) return { kind: "click", anchor: mm[1]! };

  // sleep jitter <min>~<max>
  mm = /^sleep\s+jitter\s+(\d+)\s*~\s*(\d+)$/.exec(body);
  if (mm) {
    const minMs = Number(mm[1]!), maxMs = Number(mm[2]!);
    if (minMs >= maxMs) throw new DirectiveError(line, `jitter min (${minMs}) must be < max (${maxMs})`);
    return { kind: "sleep-jitter", minMs, maxMs };
  }

  // 未知指令必须报错（spec：不得忽略）
  const head = body.split(/\s+/)[0]!;
  throw new DirectiveError(line, `unknown auk directive "${head}"`);
}

/** 批量提取：接受 lex 产出的注释行，返回 (line → directive) 序列 */
export function extractDirectives(
  comments: { line: number; comment: string }[],
): { line: number; directive: AukDirective }[] {
  return comments.flatMap(({ line, comment }) => {
    const d = parseDirective(comment, line);
    return d ? [{ line, directive: d }] : [];
  });
}
