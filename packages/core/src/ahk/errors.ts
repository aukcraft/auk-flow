/**
 * 解析错误：行级定位（spec: 脏输入鲁棒性 —— 不崩溃、可继续报告后续独立错误）
 */
export class ParseError extends Error {
  constructor(
    public readonly line: number,
    public readonly column: number,
    public readonly token: string,
    message: string,
  ) {
    super(`line ${line}:${column} — ${message} (near "${token}")`);
    this.name = "ParseError";
  }
}

export type Severity = "error" | "warning";

/** 收集多个独立错误后统一报告（不首错即崩） */
export class ErrorBag {
  readonly items: ParseError[] = [];
  add(err: ParseError): void {
    this.items.push(err);
  }
  get ok(): boolean {
    return this.items.length === 0;
  }
  throwIfAny(): void {
    if (!this.ok) {
      throw new AggregateError(
        this.items,
        `parse failed with ${this.items.length} error(s):\n` +
          this.items.map((e) => `  ${e.message}`).join("\n"),
      );
    }
  }
}
