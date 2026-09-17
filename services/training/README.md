# AukFlow 拟人化轨迹模型训练（V3）

> 协议契约：`docs/model-io-protocol.md`（输入 `[cosθ,sinθ,log₂D,T,mode]`、输出 `[dt,dx,dy]+p_eos`、采样勿取 μ、判别器 AUC≈0.5 验收）

## 环境

```bash
cd services/training
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## 完整流程

```bash
# 0)（无真实数据时）合成语料自检 —— 验证整条代码路径
python -m auk_train.train --synthetic 200 --epochs 30

# 1) 真实数据：用 tools/range/index.html 采集 500~2000 条 → auk-trials.jsonl
#    （先过 core 侧审计：packages/core src/data/corpus.ts 的白名单校验）

# 2) 过拟合验证（50 条，loss 须下降 >30% —— 管线正确性）
python -m auk_train.train --corpus auk-trials.jsonl --overfit 50 --epochs 200

# 3) 全量训练
python -m auk_train.train --corpus auk-trials.jsonl --epochs 200

# 4) 导出 ONNX（Rust ort 加载 → humanize-pass 第三号内核）
python -m auk_train.export_onnx checkpoints/auk_traj.pt

# 5) 评估（分布对比 + 判别器 AUC）
python -m auk_train.evaluate --corpus auk-trials.jsonl --model checkpoints/auk_traj.pt
```

## Colab

免费 T4 上 3~8 分钟：把本目录 + 语料上传，`!pip install -r requirements.txt` 后跑上述 2→5 步。合成数据 200 条 CPU 约 1 分钟。

## 模块

| 模块 | 职责 |
| --- | --- |
| `auk_train/data.py` | trial → 训练样本：弧长重采样 128 点、位移/时长归一、两阶段标签 |
| `auk_train/synthetic.py` | WindMouse 合成语料（管线自检 + 冷启动） |
| `auk_train/model.py` | LSTM（~30 万参数）：4+2 维输出 (μ,σ) NLL + EOS 头；`generate()` 采样推理 |
| `auk_train/train.py` | 训练循环：教师强制、梯度裁剪、过拟合验证门 |
| `auk_train/export_onnx.py` | ONNX 导出（dynamic_axes，opset 17，legacy exporter） |
| `auk_train/evaluate.py` | Wasserstein 分布对比 + 逻辑回归判别器 5 折 AUC |

## 尚未实现（V3 后续）

- `user_embed[64]` 个人适配层（V2 参数拟合的编码接入点已在 cond 维度预留）
- `context[k]` 序列上下文（连点段间停顿建模）
- 跨时间稳定性检验（"周一/周五不可分"）—— 需要带日期的真实语料
