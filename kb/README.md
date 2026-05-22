---
id: readme
title: Reverse Engineering Knowledge Base
category: README.md
tags: [README.md, ctf, readme, reverse, engineering, knowledge, base]
difficulty: beginner
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Reverse Engineering Knowledge Base

这个知识库面向授权分析、CTF、样本研究和防护验证场景，用来沉淀：

## 安全边界

本知识库只用于 CTF、授权分析、样本研究、防御验证和教学。不要把其中的分析方法用于未授权入侵、真实目标利用、持久化、规避检测或破坏性行为。

- 加壳与保护特征识别
- 脱壳与 OEP 恢复思路
- 反调试、反分析与环境对抗识别
- 二进制利用、堆利用、ROP 与格式化字符串技巧
- 静态分析、动态分析和算法逆向技巧
- 从题目与样本中提炼出的案例经验
- **现代语言二进制分析（Rust/Go）** review
- **控制流平坦化与符号执行** review
- **RSA/Hash等加密算法识别** review

## 设计原则

- 先写可复用判断依据，再写具体操作。
- 每条知识都要说明适用边界，不堆"万能技巧"。
- 失败路径和误判信号必须记录，否则检索价值会迅速下降。
- 优先沉淀能够缩短下一次分析路径的知识。

## 目录

- [`index.md`](./index.md)：总导航，按现象、目标、保护类型和流程索引。**强烈推荐从这里开始**。
- [`templates/`](./templates/)：知识条目模板与案例提炼模板。
- [`packers/`](./packers/)：壳种、保护器、压缩器的识别卡。
- [`unpacking/`](./unpacking/)：脱壳、导入修复、OEP 恢复和运行时提取。
- [`anti-analysis/`](./anti-analysis/)：反调试、反虚拟机、字符串隐藏、控制流扰动。
- [`reversing/`](./reversing/)：静态分析、动态分析、数据恢复和常见算法模式。
- [`pwn/`](./pwn/)：栈、格式化字符串、ROP、堆利用和交叉利用路线。
- [`strategy/`](./strategy/)：面向求解器和运行时检索的策略卡，强调“何时用什么方法”。
- [`workflows/`](./workflows/)：标准分析流程和排障清单。
- [`case-studies/`](./case-studies/)：从具体题目或样本中抽象出的经验条目。
- [`case-studies/reviewed/`](./case-studies/reviewed/)：已审核的正式案例。
- [`case-studies/drafts/`](./case-studies/drafts/)：自动沉淀或待补齐的草稿案例。
- [`meta/`](./meta/)：研究报告、完成总结和项目元信息，不进入主检索索引。
- [`intake.md`](./intake.md)：如何把 `prompts/reverse/` 里的材料并入知识库。
- [`CHANGELOG.md`](./CHANGELOG.md)：知识库更新日志。
- [`QUICK_REFERENCE.md`](./QUICK_REFERENCE.md)：快速参考指南。

## 2024-2025 新增专题

### Anti-analysis（1 个新增）
- [反虚拟机与反沙箱技术](./anti-analysis/anti-vm-sandbox.md) - CPUID检测、硬件指纹、绕过策略

### Reversing（7 个新增）
- [控制流平坦化识别与反混淆](./reversing/control-flow-flattening.md) - OLLVM风格混淆处理
- [符号执行入门](./reversing/symbolic-execution.md) - angr/Z3求解约束
- [Rust 二进制分析](./reversing/rust-binary-analysis.md) - Rust运行时特征与字符串提取
- [Go 二进制分析](./reversing/go-binary-analysis.md) - Go内存布局与pclntab恢复
- [RSA 算法识别与密钥提取](./reversing/rsa-algorithm-identification.md) - 大数运算识别与密钥恢复
- [Hash 算法识别与验证逻辑逆向](./reversing/hash-algorithm-identification.md) - MD5/SHA识别与攻击

### Case Studies（2 个新增）
- [Lua 字节码反编译案例](./case-studies/reviewed/luac-challenge-case.md) - 魔改Lua OpCode还原
- [多阶段迷宫求解案例](./case-studies/reviewed/mainn-maze-case.md) - 迷宫提取与自动求解

详细内容请参阅 [`CHANGELOG.md`](./CHANGELOG.md)。

## 条目最小要求

每个条目至少应包含：

- 适用场景
- 识别信号
- 判断依据
- 处理思路
- 常见误区
- 相关工具或脚本
- 参考案例

## 命名约定

- 文件名使用英文小写和连字符，例如 `upx-identification.md`。
- 一个文件只讲一个主题，避免把多个保护类型混在同一页。
- 案例条目优先写"抽象结论"，不要只是搬运原 writeup。

## 推荐阅读路径

### 新手路径
1. [Windows PE 初筛流程](./workflows/windows-pe-triage.md)
2. [UPX 壳识别](./packers/upx-identification.md)
3. [OEP 恢复流程](./unpacking/oep-recovery-playbook.md)
4. [反调试排查清单](./anti-analysis/anti-debug-checklist.md)

### 进阶路径
1. [字符串混淆模式](./reversing/string-obfuscation-patterns.md)
2. [线性约束校验器识别与求解](./reversing/linear-constraint-checkers.md)
3. [内嵌数据结构提取与离线求解](./reversing/embedded-structure-extraction.md)
4. [控制流平坦化识别与反混淆](./reversing/control-flow-flattening.md) review
5. [符号执行入门](./reversing/symbolic-execution.md) review

### 现代语言专项
- [Rust 二进制分析](./reversing/rust-binary-analysis.md) review
- [Go 二进制分析](./reversing/go-binary-analysis.md) review
- [字节码与脚本运行时分析](./reversing/bytecode-script-runtime.md)

### Pwn 专题
- [Pwn 快速路径](./pwn/README.md)
- [Pwn 速查表](./pwn/quick-reference.md)
- [栈与全局溢出基础](./pwn/overflow-basics.md)
- [格式化字符串利用](./pwn/format-string.md)
- [ROP 与 Shellcode](./pwn/rop-and-shellcode.md)
- [堆利用与 allocator 技巧](./pwn/heap-techniques.md)
- [进阶利用与交叉场景](./pwn/advanced.md)

### 加密算法专项
- [AES 变种识别与解密](./reversing/aes-variant-identification.md)
- [RSA 算法识别与密钥提取](./reversing/rsa-algorithm-identification.md) review
- [Hash 算法识别与验证逻辑逆向](./reversing/hash-algorithm-identification.md) review
- [XOR 加密模式](./reversing/xor-encryption-patterns.md)

### 求解策略专项
- [RE 最短可证路径策略](./strategy/re-shortest-verifiable-path.md)
- [RE 分段解密短路策略](./strategy/re-segmented-decode-short-circuit.md)
- [RE 局部反编译优先于全流恢复](./strategy/re-local-decompile-before-full-flow.md)

### Pwn 快速路径
1. [Pwn 快速路径](./pwn/README.md)
2. [栈与全局溢出基础](./pwn/overflow-basics.md)
3. [格式化字符串利用](./pwn/format-string.md)
4. [ROP 与 Shellcode](./pwn/rop-and-shellcode.md)
5. [堆利用与 allocator 技巧](./pwn/heap-techniques.md)

## 快速检索

遇到具体问题时，建议直接访问 [`index.md`](./index.md)，其中提供了：
- **按现象检索**：根据逆向过程中观察到的现象快速定位知识条目
- **按目标检索**：根据分析目标（如识别壳种、定位 OEP、排查反调试等）查找对应资源

## 后续扩展建议

- 若未来需要程序化检索，可为每个条目补一个同名 `.json` 元数据文件。
- 若要让 Agent 自动引用知识，可把 [`index.md`](./index.md) 和对应专题页纳入检索输入，而不是一次性灌入全文。
- 后续扩展领域：WebAssembly 逆向、JavaScript 反混淆、固件/嵌入式逆向、智能合约分析、ARM/MIPS 架构分析。
- Pwn 已建立基础专题页，但后续仍可继续补充更多真实题解案例和 glibc 版本化细节。
