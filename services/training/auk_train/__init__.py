"""AukFlow 拟人化轨迹模型训练包（V3）。

管线：JSONL 语料 → 归一化样本 → LSTM (NLL) → ONNX → 判别器评估。
协议：docs/model-io-protocol.md（冻结）。
"""

__version__ = "0.1.0"
