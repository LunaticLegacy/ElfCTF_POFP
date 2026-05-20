---
id: pwn-overflow-basics
title: 栈与全局溢出基础
category: pwn
tags: [pwn, ctf, overflow, basics, exploit-development]
difficulty: beginner
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, exploit-development]
risk_level: dual-use
---
# 栈与全局溢出基础

## 摘要

这页整理最常见的 PWN 入门利用路线：栈溢出、全局溢出、结构体字段覆盖、整数符号位绕过，以及解析器里常见的 `memcpy` 长度错误。

## 适用场景

- 保护类型：`NX`、`Canary`、`PIE`、`RELRO` 任意组合
- 文件类型：ELF、PE、服务端二进制、题目附件
- 分析目标：`ret2win`、覆盖函数指针、覆盖对象字段、覆盖返回地址、稳定触发 `win()`
- 不适用条件：题目本质是语义逆向、协议逆向或纯算法题

## 识别信号

- `gets`、`scanf("%s")`、`strcpy`、`memcpy`、`read` 之后没有边界校验
- 结构体里有“缓冲区 + 指针”或“缓冲区 + 函数指针”
- 看到 `cyclic` 偏移后，保存的 `RBP/RIP` 或返回地址被覆盖
- `scanf("%d")`、`int`/`short`/`char` 混用，出现符号位或截断问题
- 解析器先拷贝再校验，或者校验长度和实际拷贝长度不一致

## 判断依据

- 如果只是单次输入即可覆盖控制流，优先考虑栈溢出或全局变量覆盖
- 如果可以把“数据”覆盖成“指针”，优先找函数指针、虚表指针或对象方法表
- 如果目标函数在后续流程仍会被调用，优先做短链利用，不一定要直接拿 shell
- 如果溢出来自文件解析器，要检查是否需要恢复 `rbx`、循环计数器等 callee-saved 寄存器

## 处理思路

1. 先用 `checksec` 和最小输入确认保护状态
2. 用 `cyclic` 或小步试探确认精确偏移
3. 判断可利用目标：
   - `win()` / flag 函数
   - 函数指针 / 虚表指针
   - GOT / PLT / `.fini_array`
   - 返回地址 / `saved rbp`
4. 如果 `Canary` 存在，优先找泄漏或转去非栈路线
5. 如果 `NX` 开启，优先考虑 ROP、ret2libc 或可控代码段
6. 如果是解析器栈溢出，确认是否要恢复寄存器和栈布局后再返回

## 常见误区

- 只盯着返回地址，忽略了更简单的函数指针覆盖
- 把有符号整数当成无符号整数处理，导致偏移判断错位
- 计算 offset 时忘了栈对齐和 `ret` 预留
- 文件解析器里只修 RIP，不修后续逻辑依赖的寄存器
- 认为“有 canary 就一定不能做栈溢出”，其实很多题可以先 leak 再打

## 失败信号与转向条件

- 偏移能打到，但程序总是在返回前崩溃，可能是栈对齐、寄存器恢复或校验逻辑没处理好
- 栈路线被 canary 完整阻断，转去格式化字符串、堆或信息泄漏优先
- 目标地址不可控但数据结构可控，转去对象指针覆盖或堆利用
- 纯 `ret2win` 不通时，转去 `ROP` 或 `shellcode staging`

## 工具与脚本

- 工具：`checksec`、`file`、`readelf`、`ROPgadget`、`ropper`、`pwndbg`
- 现有脚本：`pwntools.cyclic`、`cyclic_find`
- 输出产物：偏移值、控制流覆盖点、最小复现 payload、可稳定触发的利用链

## 记录规范

- 样本 hash：
- 平台与位数：
- 是否需要管理员权限：
- 是否涉及驱动、服务或内核组件：

## 参考案例

- [ROP 与 Shellcode](./rop-and-shellcode.md)
- [格式化字符串利用](./format-string.md)
- [CTF Pwn 技能笔记](../../skill/ctf-pwn/overflow-basics.md)

## 后续待补

- 更多“仅靠栈偏移即可稳定过关”的小题案例
- 文件解析器里 callee-saved 寄存器恢复的完整案例
