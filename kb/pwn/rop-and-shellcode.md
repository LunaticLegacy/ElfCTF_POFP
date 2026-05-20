---
id: pwn-rop-and-shellcode
title: ROP 与 Shellcode
category: pwn
tags: [pwn, ctf, rop, and, shellcode, exploit-development]
difficulty: advanced
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, exploit-development]
risk_level: dual-use
---
# ROP 与 Shellcode

## 摘要

当栈或堆已经可控、但 `NX` 让你不能直接执行注入代码时，最常见的路线就是 ROP。这里的核心不是“堆 gadget”，而是把你手里的信息泄漏、寄存器控制和写入原语拼成一条最短可证路径。

## 适用场景

- 保护类型：`NX` 开启、`PIE` 可有可无、`Canary` 可能存在
- 文件类型：ELF、远程服务、需要多阶段交互的题目
- 分析目标：`ret2win`、`ret2libc`、`syscall`、`stack pivot`、`shellcode staging`
- 不适用条件：还没确定控制流原语，或者题目只是一般性语义分析

## 识别信号

- 你已经拿到了 `RIP`，但没有直接可执行的 shellcode 区域
- 存在 libc 泄漏，或者可以轻松拿到 `puts@GOT` / `printf@GOT` 之类地址
- 目标程序有 `read`、`gets`、`fgets`、`recv` 等可重复交互点
- gadget 虽然少，但 `__libc_csu_init` 或 libc 本体里能拼出调用链

## 判断依据

- 如果只差一个函数调用，先考虑 `ret2win`
- 如果能泄漏 libc，优先 `ret2libc`
- 如果参数控制不够，优先找 `ret2csu`
- 如果栈空间太小，优先 `stack pivot` 到 BSS、heap 或预写缓冲区
- 如果 `system()` 被拦或不稳定，直接考虑 `syscall; ret`

## 处理思路

1. 先确认 offset、对齐和返回链长度
2. 找到最小可用 gadget 集合：
   - `pop rdi; ret`
   - `pop rsi; ret`
   - `pop rdx; ret`
   - `syscall; ret`
   - `leave; ret` / `xchg rax, rsp`
3. 判断是直接调用函数，还是先泄漏再二阶段利用
4. 如果 payload 有坏字符，考虑分段写、XOR 编码或 staging
5. 如果 shellcode 不能直接落地，先用短 stub 拉第二阶段
6. 稳定后再考虑自动化求解和远程兼容性

## 常见误区

- 忘了 `movaps` / 栈对齐问题，导致看起来像 gadget 选错
- 只看二进制 gadget，不看 libc 和已导入函数
- 二阶段链已经在路上，却没有处理输入回显和缓冲刷新
- 小栈里硬塞长链，结果还没到目标地址就把自己破坏了
- 盲目追求 shell，忽略 `win()`、flag 函数或直接文件读写路径

## 失败信号与转向条件

- 没有足够 gadget，转去找 stack pivot 或用 libc gadget
- `system` 不可用或行为异常，转去原始 syscall
- 目标空间太小，转去 shellcode staging
- 能泄漏但不能稳定写，转去格式化字符串或堆利用先拿写能力

## 工具与脚本

- 工具：`pwntools`、`ROPgadget`、`ropper`、`one_gadget`、`gdb`
- 现有脚本：`pwntools.ROP()`、`DynELF`
- 输出产物：libc 基址、寄存器控制链、pivot 地址、最终执行入口

## 参考案例

- [栈与全局溢出基础](./overflow-basics.md)
- [格式化字符串利用](./format-string.md)
- [CTF Pwn 技能笔记](../../skill/ctf-pwn/rop-and-shellcode.md)

## 后续待补

- 一页式 ret2libc / ret2csu 速查表
- 小栈 pivot 的完整例题
