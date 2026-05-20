---
id: pwn-readme
title: Pwn 知识库
category: pwn
tags: [pwn, ctf, readme, exploit-development]
difficulty: beginner
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, exploit-development]
risk_level: dual-use
---
# Pwn 知识库

## 安全边界

本目录只用于 CTF、授权分析、教学和防御验证。不要把利用链、漏洞原语或调试技巧用于未授权入侵、真实目标利用、持久化或规避检测。

这一组条目面向二进制利用、服务利用和内存破坏类 CTF 题目。它不负责解释题目语义本身，而是回答一个更直接的问题：**已经确认有漏洞时，下一步怎么把它稳定转成可复现的利用链。**

## 什么时候该看这里

- 已经确认是 native binary / service，而不是纯 web、纯 crypto 或纯逆向语义问题
- 已经看到明显的内存破坏原语，例如越界读写、格式化字符串、UAF、双重释放、整数溢出
- 目标是拿到 `win()`、shell、任意读写、权限提升或稳定的崩溃复现
- 已经做过 `checksec`、`file`、`readelf`、`strings` 这类基础侦察

## 目录

- [Pwn 速查表](./quick-reference.md)
- [栈与全局溢出基础](./overflow-basics.md)
- [格式化字符串利用](./format-string.md)
- [ROP 与 Shellcode](./rop-and-shellcode.md)
- [堆利用与 allocator 技巧](./heap-techniques.md)
- [进阶利用与交叉场景](./advanced.md)

## 推荐阅读顺序

1. 先看 [栈与全局溢出基础](./overflow-basics.md)
2. 再看 [格式化字符串利用](./format-string.md)
3. 然后看 [ROP 与 Shellcode](./rop-and-shellcode.md)
4. 如果题目涉及堆，再看 [堆利用与 allocator 技巧](./heap-techniques.md)
5. 遇到 seccomp、ret2dlresolve、沙箱或内核交叉场景时，再看 [进阶利用与交叉场景](./advanced.md)
6. 临场需要快速决策时，先看 [Pwn 速查表](./quick-reference.md)

## 快速分流

| 现象 | 优先专题 |
| --- | --- |
| `gets` / `scanf("%s")` / `memcpy` / 固定长度栈缓冲区 | [overflow-basics.md](./overflow-basics.md) |
| `printf(user_input)` / `%p` / `%n` / 需要先泄漏再写 | [format-string.md](./format-string.md) |
| NX 已开启、但存在可控 RIP / 已有 libc 泄漏 | [rop-and-shellcode.md](./rop-and-shellcode.md) |
| `tcache` / `unsorted bin` / UAF / FSOP / allocator 行为异常 | [heap-techniques.md](./heap-techniques.md) |
| seccomp / ret2dlresolve / sandbox / kernel or Windows exploitation crossover | [advanced.md](./advanced.md) |

## 使用原则

- 先确认原语，再选路线，不要上来就硬写 ROP
- 先找泄漏，再决定是走 ret2libc、堆利用还是 shellcode staging
- 版本信息很重要，尤其是 glibc、NX、PIE、RELRO、Canary
- 如果两轮分析没有新增结构性信息，就该切换策略，而不是继续重复枚举

## 相关入口

- [CTF Pwn 技能笔记](../../skill/ctf-pwn/SKILL.md)
- [Field Notes](../../skill/ctf-pwn/field-notes.md)
