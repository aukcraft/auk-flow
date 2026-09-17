/**
 * 匿名语料格式与审计（spec data-collection）。
 *
 * 格式（JSONL，一行一 trial）：
 *   { "points": [[t,x,y],...], "dist", "angle", "duration",
 *     "age_band"?: "40-45", "device": "mouse" }
 *
 * 审计红线：无用户 ID / 无设备指纹字段 / 无精确年龄或生日 /
 * 字段组合不可回溯到特定自然人。同一来源的多条 trial 不共享标识
 * —— 语料文件层面由「逐条独立、永不聚合」保证（伪 ID 不存在即可审计）。
 */

export interface Trial {
  points: [number, number, number][];
  dist: number;
  angle: number;
  duration: number;
  age_band?: string;
  device?: string;
}

/** 允许的字段白名单（多余字段 = 潜在指纹 → 审计失败） */
const ALLOWED = new Set(["points", "dist", "angle", "duration", "age_band", "device"]);

const AGE_BAND_RE = /^(14-17|18-25|26-35|36-45|46-55|56-65|66\+)$/;

export interface AuditIssue {
  line: number;
  reason: string;
}

export interface AuditReport {
  ok: boolean;
  totalTrials: number;
  issues: AuditIssue[];
}

/** 审计一个 JSONL 语料文件（每行一 trial） */
export function auditCorpus(jsonl: string): AuditReport {
  const issues: AuditIssue[] = [];
  const lines = jsonl.split(/\r?\n/).filter((l) => l.trim() !== "");
  lines.forEach((line, i) => {
    let t: Record<string, unknown>;
    try {
      t = JSON.parse(line) as Record<string, unknown>;
    } catch {
      issues.push({ line: i + 1, reason: "invalid JSON" });
      return;
    }
    for (const k of Object.keys(t)) {
      if (!ALLOWED.has(k)) issues.push({ line: i + 1, reason: `non-whitelisted field "${k}" (fingerprint risk)` });
    }
    const age = t["age_band"];
    if (age !== undefined && (typeof age !== "string" || !AGE_BAND_RE.test(age))) {
      issues.push({ line: i + 1, reason: `age_band must be a coarse band, got ${JSON.stringify(age)}` });
    }
    const pts = t["points"];
    if (!Array.isArray(pts) || pts.length < 3) {
      issues.push({ line: i + 1, reason: "points must be an array of >=3 [t,x,y]" });
    } else {
      for (const p of pts as unknown[][]) {
        if (!Array.isArray(p) || p.length !== 3 || p.some((v) => typeof v !== "number")) {
          issues.push({ line: i + 1, reason: "malformed point (must be [t,x,y] numbers)" });
          break;
        }
      }
    }
    if (t["duration"] !== undefined && typeof t["duration"] !== "number") {
      issues.push({ line: i + 1, reason: "duration must be number" });
    }
  });
  return { ok: issues.length === 0, totalTrials: lines.length, issues };
}

/**
 * 脏数据剔除（spec：质量 > 数量）。
 * 规则：trial 内部停顿 >2s 的段落切分；过短（<3 点或 <40ms）剔除。
 */
export function cleanTrial(trial: Trial): Trial[] {
  const pts = trial.points;
  if (pts.length < 3) return [];
  const segments: [number, number, number][][] = [[]];
  for (let i = 0; i < pts.length; i++) {
    const prev = segments.at(-1)!.at(-1);
    if (prev && pts[i]![0] - prev[0] > 2000) segments.push([]); // 2s 停顿 → 切段
    segments.at(-1)!.push(pts[i]!);
  }
  return segments
    .filter((seg) => seg.length >= 3 && seg.at(-1)![0] - seg[0]![0] >= 40)
    .map((points) => ({
      ...trial,
      points: points.map((p, idx) => [idx === 0 ? 0 : p[0] - points[0]![0], p[1], p[2]] as [number, number, number]),
      duration: points.at(-1)![0] - points[0]![0],
    }));
}

/**
 * 年龄门（spec：14 岁以下不采集）。
 * 返回 null = 允许；返回原因 = 拒绝。
 */
export function ageGate(declaredAge: number | null): { allowed: boolean; reason?: string } {
  if (declaredAge !== null && declaredAge < 14) {
    return { allowed: false, reason: "under-14: collection disabled" };
  }
  return { allowed: true };
}
