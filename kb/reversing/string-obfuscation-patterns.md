---
id: reversing-string-obfuscation-patterns
title: 字符串混淆模式
category: reversing
tags: [reversing, ctf, string, obfuscation, patterns, authorized-analysis, malware-research]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 字符串混淆模式

## 摘要

用于识别“字符串不存在于静态视图中，但运行时或脚本中能够恢复”的常见模式，并决定是追数据流还是直接恢复常量。

## 适用场景

- 保护类型：简单混淆、运行时拼接、异或/加减/查表编码。
- 文件类型：本地二进制、脚本、字节码、CTF 逆向题。
- 分析目标：恢复关键比较字符串、密钥、flag 构造片段、协议字段。
- 不适用条件：强加密、远程获取密钥、纯壳保护导致的整体不可见。

## 识别信号

- 静态字符串极少，但存在大量看似无意义的字节数组或整数表。
- 比较逻辑前存在循环、查表、按字节运算、分段拼接。
- 用户输入与常量之间有短小变换链，而不是直接比较。

## 判断依据

- 若变换链短、可逆、输入输出边界清晰，优先写最小恢复脚本。
- 若字符串只在运行时短暂出现，优先在比较点或使用点观察，而不是全程跟踪。
- 若同时存在查表和异或，不要先假设加密强度高，很多题只是组合编码。

## 处理思路

1. 先找比较点、格式校验点或成功路径打印点。
2. 沿数据流回溯到常量来源，标记数组、表和立即数。
3. 判断变换是否可逆，能脚本恢复则优先脚本恢复。
4. 将恢复逻辑和原始常量一起记录，避免下次重走。

## 常见误区

- 一开始就尝试完整反编译整个程序，而不是先抓关键比较路径。
- 把简单编码误认为复杂密码学。
- 恢复出结果后不记录“常量来自哪里、在哪一步恢复”。

## 失败信号与转向条件

- 数据流跨线程、跨模块或依赖运行时外部输入，说明需要动态观察。
- 关键常量每次运行变化，说明可能还有环境相关派生步骤。
- 变换链过长且混合控制流扰动，需转向局部插桩或运行时抓取。

## 工具与脚本

- 工具：反汇编器、反编译器、最小恢复脚本、内存查看器。
- 现有脚本：
  - `prompts/reverse/re2/verify_flag.py`
  - `prompts/reverse/PVZ_2025/brute_force_flag.py`
  - `prompts/reverse/Project1/solve.py`
- 输出产物：恢复脚本、常量表、变换说明。

## 记录规范

- 样本 hash：记录。
- 平台与位数：如与平台相关需记录。
- 是否需要管理员权限：通常不需要。
- 是否涉及驱动、服务或内核组件：通常否。

## 参考案例

- `prompts/reverse/peek_stack/knowledge_card.json`
- `prompts/reverse/re2/writeup.md`
- `prompts/reverse/Project1/writeup.md`

## 后续待补

- 增加查表替换、S-box、状态机比较三类子模式。
- 增加“何时写脚本，何时直接动态抓取”的判断表。
