---
id: reversing-key-schedule-reversal
title: 密钥调度逆向
category: reversing
tags: [key-schedule, aes, crypto, ctf, analysis]
difficulty: advanced
status: draft
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 密钥调度逆向

## 摘要

当题目不是直接给出轮密钥，而是把密钥扩展过程也改过时，就需要把 key schedule 单独抽出来分析。它常和自定义 S-Box、Rcon 以及轮函数修改一起出现。

## 识别信号

- 密钥扩展函数里有固定轮常量表
- `SubWord`、`RotWord` 或类似逻辑被替换
- 主加密逻辑正确，但解密结果始终不对

## 判断依据

- 如果主算法能对上而最终明文不对，优先检查调度而不是主轮函数
- 轮常量和 S-Box 都可能被题目改写，不能默认照搬标准 AES

## 处理思路

1. 先把 key schedule 与主加密分开
2. 提取轮常量和变换规则
3. 与标准实现逐轮对照
4. 必要时写最小复现脚本验证轮密钥

## 相关内容

- [AES 算法变种识别](./aes-variant-identification.md)
- [Project1 自定义 AES 加密案例](../case-studies/reviewed/project1-custom-aes-case.md)
