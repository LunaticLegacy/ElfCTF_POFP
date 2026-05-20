---
id: case-studies-reviewed-l00k-at-h3r3-unpack-notes
title: L00K_at_h3r3 脱壳案例笔记
category: case-studies
tags: [case-studies, ctf, l00k, at, h3r3, unpack, notes]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# L00K_at_h3r3 脱壳案例笔记

## 来源

- 题目或样本：`L00K_at_h3r3`
- 原始目录：`prompts/reverse/L00K_at_h3r3/`
- 原始 writeup：`prompts/reverse/L00K_at_h3r3/writeup.md`

## 结论摘要

- 该题目适合沉淀为“轻量壳识别 + 运行时解包 + 产物恢复”的案例。
- 现有资产已经包含 `emulate_unpack.py`、`decompress_payload.py`、`patch_upx.py`，说明题解路径并不是单纯静态阅读，而是有明显“先恢复执行载荷，再继续分析”的结构。

## 关键证据

- 存在专门的解包与修补脚本，说明样本前置层对主逻辑有遮蔽作用。
- 题目资产组织方式本身表明“脱壳步骤”是求解主线，而不是附带步骤。

## 可复用知识点

- 当题目目录里已经出现专门的 payload 恢复脚本时，应优先把它们抽象为“恢复步骤和判定依据”，而不是只保留最终 flag 过程。
- 对于存在多个恢复脚本的题目，知识库应记录“每个脚本解决哪一层问题”。

## 误判与返工

- 若只看最终 writeup 而不梳理解包脚本，会错过最可复用的部分。

## 应沉淀到的专题页

- `packers/upx-identification.md`
- `unpacking/oep-recovery-playbook.md`

## 待补脚本或自动化点

- 把该题的恢复步骤改写成标准案例模板。
- 补一份“脚本输入、输出、验证条件”说明。
