---
id: reversing-caesar-cipher-identification
title: Caesar 密码识别
category: reversing
tags: [caesar, encoding, xor, ctf, string-obfuscation]
difficulty: beginner
status: draft
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Caesar 密码识别

## 摘要

Caesar 密码本质上是固定偏移的字符替换。CTF 题里常见的变体不是“字母表循环位移”，而是直接对 ASCII/字节做加减运算。

## 识别信号

- 可见字符串在运行前后只差固定偏移
- 逻辑里出现逐字节加减、取模或简单循环
- 解密结果通常很快落到 Base64、明文口令或 flag 格式

## 判断依据

- 如果所有字符都以同一常量平移，优先先试固定偏移
- 如果结果仍是可打印字符串，再继续看是否接了 Base64、Hex 或其他编码

## 处理思路

1. 先确认是逐字节运算，不要先假设复杂密码学
2. 尝试 `+1`、`-1`、`+13`、`-13` 等常见偏移
3. 如果仍不通，再检查是否是“字母表内移位”还是“原始字节加减”

## 相关内容

- [简单变换模式](./simple-transformation-patterns.md)
- [Base64 编码检测](./base64-detection.md)
- [monster_invasion 基础字符加密案例](../case-studies/reviewed/monster-invasion-case.md)
