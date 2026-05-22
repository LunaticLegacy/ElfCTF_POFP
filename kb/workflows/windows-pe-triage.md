---
id: workflows-windows-pe-triage
title: Windows PE 初筛流程
category: workflows
tags: [workflows, ctf, windows, pe, triage, authorized-analysis, malware-research]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Windows PE 初筛流程

## 摘要

用于在拿到一个未知 Windows 可执行文件时，快速判断应该优先走静态分析、动态跟踪、脱壳还是字符串恢复路径。

## 适用场景

- 保护类型：未知。
- 文件类型：PE32 / PE32+、DLL、简单 loader。
- 分析目标：缩短从“未知样本”到“第一条高价值路径”的时间。
- 不适用条件：驱动、固件、纯脚本、移动端样本。

## 流程

1. 确认文件类型、位数、入口点、节区布局和导入稀疏度。
2. 看字符串、资源、版本信息和明显的格式常量。
3. 判断是否存在加壳/压缩特征，再决定是否先脱壳。
4. 若未明显加壳，优先寻找输入处理、比较逻辑、输出点和错误提示。
5. 若行为依赖运行环境，再建立最小动态观察基线。

## 决策信号

- 节区异常 + 导入稀疏：先看壳和 loader。
- 字符串丰富 + 导航清晰：先走静态比较路径。
- 字符串少但常量数组多：优先看编码/解码逻辑。
- 调试行为异常：转到反调试排查。

## 产出要求

- 第一轮必须得到一个明确结论：
  - 更像加壳样本
  - 更像算法/编码题
  - 更像环境依赖题
  - 证据不足，需要补采集

## 常见误区

- 一开始就全量反编译。
- 不记录第一轮判断依据，后续回溯困难。
- 忽略“先排除壳，再谈逻辑”的优先级。

## 关联专题

- [UPX 壳识别](../packers/upx-identification.md)
- [OEP 恢复流程](../unpacking/oep-recovery-playbook.md)
- [反调试排查清单](../anti-analysis/anti-debug-checklist.md)
- [字符串混淆模式](../reversing/string-obfuscation-patterns.md)

## 后续待补

- 增加 x64 与 DLL 样本专用分支。
- 增加从 `prompts/reverse/` 自动提取初筛线索的脚本。
