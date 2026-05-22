---
id: reversing-cbc-mode-analysis
title: CBC 模式分析
category: reversing
tags: [cbc, block-cipher, crypto, ctf, analysis]
difficulty: intermediate
status: draft
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# CBC 模式分析

## 摘要

CBC 是最常见的分组密码工作模式之一。CTF 逆向里看到“分块 + 前一块参与下一块”的结构时，先怀疑 CBC，再确认 IV、链式依赖和填充。

## 识别信号

- 明显按 16 字节或固定块长处理数据
- 每块解密前会和前一块密文或 IV 做异或
- 首块和后续块的处理路径不同

## 判断依据

- 如果每块都依赖前一块状态，说明不是纯 ECB 逻辑
- 如果存在独立初始向量或 Key1，优先把它当作 IV 验证

## 处理思路

1. 先确认块长
2. 再确认链式依赖
3. 把“解密后再异或”和“先异或再加密”分开建模
4. 最后核对填充和编码

## 相关内容

- [AES 算法变种识别](./aes-variant-identification.md)
- [Project1 自定义 AES 加密案例](../case-studies/reviewed/project1-custom-aes-case.md)
