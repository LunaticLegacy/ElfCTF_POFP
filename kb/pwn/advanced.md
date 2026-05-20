---
id: pwn-advanced
title: 进阶利用与交叉场景
category: pwn
tags: [pwn, ctf, advanced, exploit-development]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, exploit-development]
risk_level: dual-use
---
# 进阶利用与交叉场景

## 摘要

这一页收录不太适合放进基础目录，但在真题里经常出现的交叉场景：`seccomp`、`ret2dlresolve`、`UAF` 变体、沙箱逃逸、以及少量和内核或 Windows 利用有关的路线。

## 适用场景

- 你已经有基础泄漏或控制流能力，但常规 `ret2libc` / `heap` 路线被卡住
- 目标程序加了 `seccomp`、调用过滤、沙箱、VM、限制 shell 的环境
- 题目明显要求“自己找动态解析”或者“自己构造符号解析”
- 你需要把 PWN 与 RE、MISC、KERNEL、Windows exploit 组合起来

## 识别信号

- `seccomp` / `prctl` / `openat` / `mprotect` / `clone` 相关限制
- 程序没有现成导入符号，或者导入很少，但运行时仍然可以解析
- 出现自定义 VM、解释器、脚本运行时、GUI / sandbox / restricted shell
- 需要跨越 32/64 位、x86/x32、Linux/Windows 或用户态/内核态边界

## 判断依据

- 如果已知目标函数但缺少解析方式，优先看 `ret2dlresolve`
- 如果系统调用被过滤，优先看 `mprotect`、`openat`、`read`、`write` 的可用组合
- 如果是沙箱题，先判断是编码问题、syscall 限制还是权限隔离
- 如果是 UAF / 类型混淆，先把“对象复用”当成攻击面，而不是只盯 heap metadata

## 处理思路

1. 先确认限制边界：系统调用、导入表、权限、架构
2. 找到能维持最小交互的 primitive：读、写、调函数、分配对象、触发回调
3. 决定是否要用动态解析或自己补符号
4. 如果有沙箱，先找“被允许的最强原语”，再考虑逃逸
5. 如果要跨架构，确认 calling convention、字长和栈布局

## 常见误区

- 看到限制就默认无解，没先做最小 syscall / 原语验证
- 题目明明是沙箱或 VM，却一直在堆上死磕
- 只会 `execve("/bin/sh")`，却没有准备文件读取或信息回传方案
- 忽略平台差异，导致 payload 在本地和远端行为不同

## 失败信号与转向条件

- `system`、`execve` 一路失败，转去原始 syscall 或文件泄漏
- 动态解析卡住，转去 `ret2dlresolve` 或手工补地址
- 限制太强，转去沙箱/VM 专项知识
- 已经进入内核或 Windows 语境，转去对应平台的专门条目

## 工具与脚本

- 工具：`seccomp-tools`、`pwntools`、`gdb`、`strace`、`ltrace`
- 现有脚本：`DynELF`、`ret2dlresolve` 模板、系统调用验证脚本
- 输出产物：限制模型、可用 syscall 表、动态解析链、逃逸链

## 参考案例

- [ROP 与 Shellcode](./rop-and-shellcode.md)
- [堆利用与 allocator 技巧](./heap-techniques.md)
- [CTF Pwn 技能笔记](../../skill/ctf-pwn/advanced.md)

## 后续待补

- `ret2dlresolve` 的完整流程图
- 沙箱逃逸的分类型决策树
