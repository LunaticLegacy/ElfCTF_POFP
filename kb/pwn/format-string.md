---
id: pwn-format-string
title: 格式化字符串利用
category: pwn
tags: [pwn, ctf, format, string, exploit-development]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, exploit-development]
risk_level: dual-use
---
# 格式化字符串利用

## 摘要

格式化字符串的价值不只在“能不能 `%n` 写内存”，更在于它通常先给你**泄漏能力**，再给你**原子写能力**。多数题目都可以分成“先定位栈上关键信息，再泄漏地址，最后改控制流”。

## 适用场景

- 保护类型：`Canary`、`PIE`、`RELRO`、`NX`
- 文件类型：ELF、服务端程序、菜单题、游戏题
- 分析目标：泄漏栈/PIE/libc、GOT 覆盖、`.fini_array` 复用、`__free_hook`/vtable 目标、blind pwn
- 不适用条件：输入不是格式化字符串源，或者题目根本没有 `printf`/`fprintf` 路径

## 识别信号

- 用户输入直接进入 `printf`、`fprintf`、`sprintf`、`snprintf`
- 可以看到 `%p` 打印出堆栈地址、libc 地址或类似 `0x7f...` 的输出
- 程序允许多次触发同一路径，适合“先泄漏，后写入”的多阶段打法
- `__printf_chk`、字符过滤或长度过滤存在，但并不一定彻底阻断漏洞

## 判断依据

- 如果能先泄漏再写，优先走“泄漏 -> 定位 -> 写控制流”的顺序
- 如果 GOT 可写且 `RELRO` 不是 Full，GOT 覆写通常比栈回写更稳
- 如果 Full RELRO，但有其它可写结构，优先看 hook、虚表、`.fini_array` 或对象字段
- 如果只有读没有写，依然可以把格式化字符串当成信息收集器，再配合别的原语打最终链

## 处理思路

1. 先确认是“真正的格式化字符串”还是“普通字符串输出”
2. 用 `%p`、`%lx`、`%s` 之类定位栈上的偏移
3. 尝试泄漏 `canary`、`PIE base`、`libc base`、堆地址
4. 判断写目标：
   - GOT 覆写
   - 函数指针 / 虚表
   - `.fini_array`
   - `__free_hook` 或等价 hook
5. 写入时尽量分拆为低字节/短写，减少一次性污染
6. 如果程序会提前退出，就优先构造“单次泄漏 + 单次写入”的链

## 常见误区

- 只会 `%n`，不会先做可靠泄漏
- 忽略 32 位和 64 位下参数位置差异
- 没注意字符过滤、宽度限制或 `__printf_chk`
- 对“盲打”过于乐观，没有做偏移验证
- 忘了写目标要和内存权限匹配，导致写成功但没效果

## 失败信号与转向条件

- `%p` 输出异常但不稳定，先检查输入截断、换行和编码问题
- 无法写 `%n`，但依然能泄漏，转去和 ROP / heap 结合
- GOT 不可写，转向 `.fini_array`、对象字段或堆目标
- 只有单轮机会，优先只做最关键的泄漏，不要贪多

## 工具与脚本

- 工具：`pwntools`、`gdb`、`pwndbg`、`one_gadget`、`libc-database`
- 现有脚本：`fmtstr_payload`
- 输出产物：偏移值、泄漏地址、`libc base`、写入目标、最终控制流落点

## 参考案例

- [ROP 与 Shellcode](./rop-and-shellcode.md)
- [堆利用与 allocator 技巧](./heap-techniques.md)
- [CTF Pwn 技能笔记](../../skill/ctf-pwn/format-string.md)

## 后续待补

- blind pwn 的完整分阶段调试模板
- `.fini_array` 多轮复用的完整示例
