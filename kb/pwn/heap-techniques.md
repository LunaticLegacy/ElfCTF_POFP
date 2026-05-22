---
id: pwn-heap-techniques
title: 堆利用与 allocator 技巧
category: pwn
tags: [pwn, ctf, heap, techniques, allocator, exploit-development]
difficulty: advanced
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, exploit-development]
risk_level: dual-use
---
# 堆利用与 allocator 技巧

## 摘要

堆题的难点通常不是“有没有漏洞”，而是“当前 glibc / allocator 版本允许你走哪条链”。这页把堆利用拆成三个问题：先看版本，再看原语，最后选最短能复现的攻击面。

## 适用场景

- 保护类型：`NX`、`PIE`、`RELRO`、`Canary` 任意组合
- 文件类型：ELF、服务端菜单题、对象池、allocator 封装题
- 分析目标：`tcache poisoning`、`unsorted bin` 泄漏、`UAF`、`FSOP`、hook/vtable 覆写
- 不适用条件：没有 heap 原语，或题目本质是纯逻辑/纯协议题

## 识别信号

- 菜单里有 `malloc/free/edit/show` 或类似对象生命周期操作
- 复用已释放对象、重复释放、越界写到 chunk metadata
- 打印出来的地址像 `0x55...`、`0x7f...`，而且和堆分配相关
- 题目提示“自定义 allocator”“对象池”“缓存”“arena”“pool”

## 判断依据

- 如果能把数据改成指针，先找 chunk/对象之间的邻接关系
- 如果存在泄漏，优先确认是 heap base、libc base 还是 stack leak
- 如果 glibc 较新，先检查 safe-linking、tcache、hook 是否还可用
- 如果是自定义 allocator，不要默认它遵循标准 ptmalloc 的全部行为
- 如果有 UAF，优先看是否能“回收后复用”对象头或虚表

## 处理思路

1. 先确认 allocator 版本和关键保护状态
2. 绘制对象生命周期图，标出可重用、可越界、可回收的块
3. 找到最小原语：
   - 任意读
   - 任意写
   - 受限写
   - UAF 读 / 写
4. 决定是走泄漏链还是直接劫持链
5. 根据版本选择目标：
   - 旧版 glibc 可看 `__free_hook` / `__malloc_hook`
   - 新版 glibc 更看重 vtable、FSOP、对象指针、返回链
6. 将 heap 利用与 ROP / format string 联动，避免单点失效

## 常见误区

- 把所有堆题都当成 tcache poisoning
- 忽略版本差异，沿用过期的 hook 技巧
- 只看 chunk header，不看对象层字段和业务逻辑
- UAF 只做读，不考虑写回或对象复用
- 没做 heap feng shui，导致 exploit 不稳定

## 失败信号与转向条件

- 泄漏能出来，但写不进去，转去格式化字符串或 ROP 先补写能力
- tcache 链被 safe-linking 卡住，转去 unsorted bin、largebin 或对象指针
- hook 不可用，转去 vtable、FSOP、`setcontext` 或返回地址
- 业务逻辑会回收或重置对象，先找可控生命周期再利用

## 工具与脚本

- 工具：`pwndbg`、`gef`、`heaptrace`、`libheap`、`gdb`
- 现有脚本：pwntools + 自定义 heap 观察脚本
- 输出产物：heap base、libc base、对象图、可控 chunk、最终劫持点

## 参考案例

- [格式化字符串利用](./format-string.md)
- [ROP 与 Shellcode](./rop-and-shellcode.md)
- [CTF Pwn 技能笔记](../../skill/ctf-pwn/heap-techniques.md)

## 后续待补

- glibc 2.34+ 的替代攻击目标清单
- 自定义 allocator 的专门识别流程
