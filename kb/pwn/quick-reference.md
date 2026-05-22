---
id: pwn-quick-reference
title: Pwn 速查表
category: pwn
tags: [pwn, ctf, quick, reference, exploit-development]
difficulty: beginner
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, exploit-development]
risk_level: dual-use
---
# Pwn 速查表

这是一页临场用的快速参考，不替代详细专题页。目标是让你在拿到样本后的前 5 到 10 分钟内，快速判断应该走 heap、fmt、ROP 还是 shellcode staging。

## 通用起手式

1. `file` / `checksec` / `readelf -h` / `strings`
2. 确认架构、位数、NX、PIE、Canary、RELRO
3. 找输入点和输出点
4. 判断原语：读、写、越界、UAF、格式化字符串、整数溢出
5. 先拿泄漏，再拿控制流，再决定最终目标

## 路线选择

| 你已经看到什么 | 先走哪条路 | 典型目标 |
| --- | --- | --- |
| `printf(user_input)`、`%p`、`%n` | 格式化字符串 | 泄漏 canary / libc / PIE，或写 GOT / hook |
| `gets`、`scanf("%s")`、`memcpy`、栈偏移可控 | 栈溢出 | `ret2win`、`ret2libc`、对象字段覆盖 |
| 菜单题、对象池、`malloc/free/edit/show` | 堆利用 | tcache poisoning、UAF、FSOP、vtable |
| NX 开启但已有 RIP 控制和泄漏 | ROP / shellcode staging | `ret2libc`、`syscall`、`mprotect`、pivot |

## Heap 速查

### 先问的 4 个问题

1. glibc 版本是多少
2. 有没有 UAF / double free / OOB write
3. 能不能泄漏 heap base / libc base
4. 是否还能用 hook、vtable、FSOP、返回地址

### 常见打法

| 原语 | 优先打法 | 备注 |
| --- | --- | --- |
| UAF 读 | 泄漏对象头 / libc / heap base | 先确认是否能复用对象 |
| UAF 写 | 覆盖函数指针 / vtable / tcache fd | 新版 glibc 更常见 |
| OOB 写 | 改 chunk metadata / size / 指针 | 先画内存布局 |
| 重复 free | tcache poisoning / fastbin 链 | 先看 safe-linking |
| 自定义 allocator | 先逆 allocator 规则 | 不要默认 ptmalloc 行为 |

### 常见目标

- 旧版：`__free_hook`、`__malloc_hook`
- 新版：vtable、FSOP、对象方法表、返回地址
- 泄漏优先级：heap base -> libc base -> stack leak

### 常见坑

- 只盯 tcache，忽略对象层指针
- 忽略 glibc 版本差异
- 没做 heap feng shui，导致复现不稳定

## Fmt 速查

### 先问的 4 个问题

1. 输入是否真的进入 `printf` 家族
2. `%p` 能不能泄漏
3. `%n` 能不能写
4. `RELRO` 是不是 Full

### 常见打法

| 目标 | 常见方法 | 备注 |
| --- | --- | --- |
| 泄漏栈 | `%p` / `%lx` / 参数偏移枚举 | 先找 canary |
| 泄漏 libc | 找 GOT / 返回地址 / libc 指针 | 再算 base |
| 改控制流 | GOT / `.fini_array` / hook | 视 RELRO 而定 |
| 多轮利用 | 先泄漏再重进 | 适合菜单题 |

### 写入建议

- 先短写，再长写
- 尽量拆成低字节/半字写
- 控制输出长度，避免一次性污染

### 常见坑

- 只会 `%n`，不会定位偏移
- 误判 32/64 位参数位置
- 没注意 `__printf_chk`、过滤字符、长度截断

## ROP 速查

### 先问的 4 个问题

1. 是否已经有 RIP 控制
2. 是否有 libc 泄漏
3. 栈空间够不够
4. 需要直接函数调用还是 syscall

### 常见链

| 场景 | 常见链 | 备注 |
| --- | --- | --- |
| 只想拿 shell | `ret2win` / `system("/bin/sh")` | 最短路径优先 |
| libc 可泄漏 | `ret2libc` | 先算 base |
| 参数控制不足 | `ret2csu` | 处理 3 参数调用 |
| 栈太小 | `leave; ret` / `xchg rsp, rax` | 先 pivot |
| `system` 不稳 | `syscall; ret` | `execve` / `mprotect` |

### 必查 gadget

- `pop rdi; ret`
- `pop rsi; ret`
- `pop rdx; ret`
- `syscall; ret`
- `leave; ret`

### 常见坑

- 忘了栈对齐
- 忘了二阶段输入和回显同步
- 只看二进制 gadget，不看 libc gadget

## Shellcode 速查

### 什么时候考虑

- NX 开启
- 你能控制可执行页或能先做 `mprotect`
- 题目允许 staging，或者有足够大缓冲区

### 常见链

| 目标 | 常见前置 | 备注 |
| --- | --- | --- |
| 直接执行 shellcode | RWX 区域 / 已知可执行页 | 最快但最少见 |
| 分阶段注入 | 短 stub + second stage | 适合小输入 |
| 自己开执行权限 | `mprotect` | 常见于 ROP 辅助 |
| 架构切换 | x64 -> x32 / Thumb | 交叉场景才用 |

### 常见坑

- 直接把 shellcode 当第一选择
- 忘了坏字符和换行
- 忽略输入函数会截断或过滤字节

## 一句话决策

- 有 `%p` / `%n`，先格式化字符串
- 有栈偏移和返回地址，先栈溢出
- 有菜单和对象生命周期，先堆利用
- 有 NX 但有控制流，先 ROP
- 有可执行页或能开执行权限，再考虑 shellcode

## 参考

- [Pwn 快速路径](./README.md)
- [栈与全局溢出基础](./overflow-basics.md)
- [格式化字符串利用](./format-string.md)
- [ROP 与 Shellcode](./rop-and-shellcode.md)
- [堆利用与 allocator 技巧](./heap-techniques.md)
