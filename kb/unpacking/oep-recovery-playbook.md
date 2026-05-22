---
id: unpacking-oep-recovery-playbook
title: OEP 恢复流程
category: unpacking
tags: [unpacking, ctf, oep, recovery, playbook, authorized-analysis, malware-research]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# OEP 恢复流程

## 摘要

用于在运行时解包、内存重建或轻量保护场景下，定位原始入口点并决定何时 dump、何时继续单步。

## 适用场景

- 保护类型：压缩壳、自定义 loader、运行时解密再跳转。
- 文件类型：Windows PE。
- 分析目标：找到业务逻辑入口、为 dump 和导入修复提供锚点。
- 不适用条件：强虚拟化保护、纯脚本样本、内核态样本。

## 识别信号

- 初始入口只做内存拷贝、权限修改、跳转拼接。
- 程序运行一段后，代码区或导入表区域出现明显变化。
- 真实业务字符串和 API 只在运行后才可见。

## 判断依据

- OEP 通常对应“从 loader 过渡到业务逻辑”的跳转点，而不是任意一个新映射页面。
- 单个 `jmp` 并不等于 OEP，关键在于上下文是否已经完成解压、修复、重定位和导入初始化。
- 如果程序频繁通过异常或回调切换控制流，应把“控制权稳定回到主模块”作为更可靠信号。

## 处理思路

1. 记录初始入口、模块基址、可执行页变化和关键 API 调用。
2. 观察何时开始出现正常函数序言、字符串引用和稳定调用图。
3. 在控制流从 loader 过渡到业务逻辑时记录候选 OEP。
4. 以候选点为锚检查导入、交叉引用、函数边界和后续逻辑密度。
5. 确认后再做 dump 与导入修复，避免过早导出半成品。

## 常见误区

- 看到内存被写入后立刻 dump，导致产物仍缺导入或重定位未完成。
- 把第一次回到模块内的跳转误认为 OEP。
- 只盯某个寄存器或某个断点，而不看整个初始化阶段是否结束。

## 失败信号与转向条件

- dump 后无法在反汇编器中建立正常函数图。
- 导入表残缺，样本启动后仍需大量动态解析 API。
- 控制流主要依赖异常、TLS callback 或线程切换，需要改用更宽的观察窗口。

## 工具与脚本

- 工具：调试器、内存访问监控、导入修复工具、PE 对比工具。
- 现有脚本：暂无统一脚本，建议把 OEP 候选地址和触发条件写入案例记录。
- 输出产物：OEP 候选地址、dump 时间点、导入修复状态。

## 记录规范

- 样本 hash：原始样本与 dump 产物都要记录。
- 平台与位数：区分 x86 / x64。
- 是否需要管理员权限：看样本行为。
- 是否涉及驱动、服务或内核组件：单独标注。

## 参考案例

- `prompts/reverse/L00K_at_h3r3/assets/emulate_unpack.py`
- `prompts/reverse/L00K_at_h3r3/assets/decompress_payload.py`

## 后续待补

- 增加 TLS callback 和异常驱动流程的 OEP 识别分支。
- 增加“何时修导入、何时先修字符串引用”的决策表。
