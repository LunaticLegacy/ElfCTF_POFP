---
id: case-studies-reviewed-re2-linear-check-notes
title: re2 线性校验案例笔记
category: case-studies
tags: [case-studies, ctf, re2, linear, check, notes]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# re2 线性校验案例笔记

## 来源

- 题目或样本：`re2`
- 原始目录：`prompts/reverse/re2/`
- 原始 writeup：`prompts/reverse/re2/writeup.md`

## 结论摘要

- 该题更适合沉淀为“线性约束校验器识别与求解”案例，而不是普通字符串恢复案例。
- 真正的高价值动作不是手工推每条比较，而是把栈上常量初始化和后续 `imul/add/sub/cmp` 检查阶段拆开处理。

## 关键证据

- `writeup.md` 明确指出存在 32 组检查，每组本质上是 32 个变量上的线性方程。
- `extract_and_solve.py` 先解析反汇编，再生成 Z3 约束，说明程序逻辑已经足够规则，可以离线建模。
- 程序还有前置输入 `"Yes! Let's go."`，提醒我们“求解出主体字符串”不等于“完整交互已经结束”。

## 可复用知识点

- 当一个检查函数主体由重复的乘加减和比较组成时，应优先判断是否可抽成线性约束。
- 常量初始化很长时，不要手抄；应先恢复常量表，再解析使用关系。
- 求解结果出来后，仍需补验字符范围、前置握手、输入顺序和格式要求。

## 误判与返工

- 如果把所有乘法都当成复杂加密，会浪费大量时间在错误方向上。
- 如果忽略有符号运算、位宽截断或算术右移，求解器很容易得到“看似合理但校验不过”的结果。

## 应沉淀到的专题页

- `kb/reversing/linear-constraint-checkers.md`
- `kb/reversing/string-obfuscation-patterns.md`

## 待补脚本或自动化点

- 把反汇编文本解析为统一约束表的逻辑做成可复用工具。
- 增加一份“从 `objdump` 文本恢复方程组”的最小模板。
