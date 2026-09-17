/**
 * 数据页：JSONL 语料拖入 → 统计（条数/距离分布/时长分布）+ 审计（白名单字段/年龄区间）。
 * 审计规则与 packages/core src/data/corpus.ts 同源。
 */

import { useMemo, useState } from "react";

const ALLOWED = new Set(["points", "dist", "angle", "duration", "age_band", "device"]);
const AGE_RE = /^(14-17|18-25|26-35|36-45|46-55|56-65|66\+)$/;

interface Trial {
  points: [number, number, number][];
  dist?: number;
  duration?: number;
  [k: string]: unknown;
}

export function DataPage() {
  const [trials, setTrials] = useState<Trial[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [issues, setIssues] = useState<string[]>([]);

  const stats = useMemo(() => {
    if (!trials) return null;
    const dists = trials.map((t) => t.dist ?? 0).filter((d) => d > 0);
    const durs = trials.map((t) => t.duration ?? 0).filter((d) => d > 0);
    const q = (arr: number[], p: number) => {
      const s = [...arr].sort((a, b) => a - b);
      return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]!) : 0;
    };
    // 距离分桶
    const buckets = [0, 100, 200, 400, 700, 1000, 1500, Infinity];
    const hist = buckets.slice(0, -1).map((lo, i) => ({
      label: `${lo}-${buckets[i + 1] === Infinity ? "∞" : buckets[i + 1]}`,
      n: dists.filter((d) => d >= lo && d < buckets[i + 1]!).length,
    }));
    const maxN = Math.max(...hist.map((h) => h.n), 1);
    return {
      n: trials.length,
      distQ: [q(dists, 0.25), q(dists, 0.5), q(dists, 0.75)],
      durQ: [q(durs, 0.25), q(durs, 0.5), q(durs, 0.75)],
      hist,
      maxN,
    };
  }, [trials]);

  const load = (text: string, name: string) => {
    const local: string[] = [];
    const parsed: Trial[] = [];
    text.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      try {
        const t = JSON.parse(line) as Trial;
        Object.keys(t).forEach((k) => {
          if (!ALLOWED.has(k)) local.push(`第 ${i + 1} 行：非白名单字段 "${k}"（指纹风险）`);
        });
        if (t.age_band !== undefined && !AGE_RE.test(String(t.age_band))) {
          local.push(`第 ${i + 1} 行：age_band 必须为粗区间`);
        }
        if (!Array.isArray(t.points) || t.points.length < 3) {
          local.push(`第 ${i + 1} 行：points 缺失或 <3 点`);
        }
        parsed.push(t);
      } catch {
        local.push(`第 ${i + 1} 行：JSON 解析失败`);
      }
    });
    setTrials(parsed);
    setFileName(name);
    setIssues(local);
  };

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>数据 · 语料检查</h2>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = () => load(String(rd.result), f.name);
          rd.readAsText(f);
        }}
        style={{
          border: "2px dashed #30363d", borderRadius: 8, padding: 28, textAlign: "center",
          color: "#8b949e", marginBottom: 16,
        }}
      >
        拖入 auk-trials.jsonl（或合成语料）{fileName && <span style={{ color: "#3fb950" }}> · 已加载 {fileName}</span>}
      </div>
      {stats && (
        <>
          <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
            <Stat label="trials" value={String(stats.n)} />
            <Stat label="距离 P25/P50/P75" value={stats.distQ.join(" / ") + " px"} />
            <Stat label="时长 P25/P50/P75" value={stats.durQ.join(" / ") + " ms"} />
          </div>
          <h3 style={{ fontSize: 13, color: "#8b949e" }}>距离分布</h3>
          {stats.hist.map((h) => (
            <div key={h.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ width: 70, color: "#8b949e" }}>{h.label}px</span>
              <div style={{ background: "#58a6ff", height: 12, borderRadius: 3, width: `${(h.n / stats.maxN) * 100 * 0.7}%`, minWidth: h.n ? 4 : 0 }} />
              <span>{h.n}</span>
            </div>
          ))}
          <h3 style={{ fontSize: 13, color: issues.length ? "#f85149" : "#3fb950" }}>
            审计 {issues.length ? `✗ ${issues.length} 项问题` : "✓ 通过"}
          </h3>
          {issues.slice(0, 10).map((s, i) => (
            <div key={i} style={{ fontSize: 12, color: "#f85149" }}>{s}</div>
          ))}
          <h3 style={{ fontSize: 13, color: "#8b949e", marginTop: 16 }}>训练</h3>
          <div style={{ fontSize: 12, color: "#8b949e" }}>
            <code>cd services/training && .venv/bin/python -m auk_train.train --corpus {fileName || "你的数据.jsonl"} --overfit 50</code>
            <br />过拟合验证（loss 降 &gt;30%）后全量训练 → ONNX → 本页"模拟"选模型轨迹回放。
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#8b949e" }}>{label}</div>
      <div style={{ fontSize: 18 }}>{value}</div>
    </div>
  );
}
