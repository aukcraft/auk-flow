/**
 * @auk-flow/core —— 纯 TS 核心：AHK 前端、意图 IR、humanize pass。
 * 不依赖 RN/Tauri/Node API（浏览器与引擎壳均可加载）。
 */

// AHK 前端
export { lex } from "./ahk/lexer.ts";
export { parse, parseExprText } from "./ahk/parser.ts";
export type { AhkProgram, Expr, Stmt } from "./ahk/parser.ts";
export { ParseError, ErrorBag } from "./ahk/errors.ts";
export { parseDirective, extractDirectives, DirectiveError } from "./ahk/directives.ts";
export type { AukDirective, AnchorSource } from "./ahk/directives.ts";

// 端到端入口：AHK 源码 → IR + 指令
export { compileScript } from "./pipeline.ts";

// IR
export type {
  HumanizeConfig,
  Interval,
  IrInstruction,
  IrPrimitive,
  IrProgram,
  Target,
} from "./ir/types.ts";
export { compile } from "./ir/compile.ts";
export type { AnchorDecl, CompileInput, CompileResult } from "./ir/compile.ts";
export {
  DEFAULT_TRANSFORM,
  ErrorAccumulatingRounder,
  fromNormalized,
  logicalToPhysical,
  toNormalized,
  windowPctToPhysical,
} from "./ir/coords.ts";
export type { NormalizedMove, PhysicalPoint, ScreenTransform } from "./ir/coords.ts";
export {
  AnchorResolveError,
  resolveAnchor,
} from "./ir/anchors.ts";
export type { AnchorHit, AnchorResolver, WaitStrategy } from "./ir/anchors.ts";

// humanize pass
export {
  createDefaultKernel,
  defaultRng,
  getKernel,
  registerKernel,
} from "./humanize/index.ts";
export { preciseMove } from "./humanize/windmouse.ts";
export type {
  HumanizeKernel,
  HumanizeProfile,
  MoveContext,
  MoveRequest,
  MoveStep,
} from "./humanize/index.ts";

// 数据采集与语料
export { ageGate, auditCorpus, cleanTrial } from "./data/corpus.ts";
export type { AuditIssue, AuditReport, Trial } from "./data/corpus.ts";
