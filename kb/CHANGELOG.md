---
id: changelog
title: 知识库更新日志
category: CHANGELOG.md
tags: [CHANGELOG.md, ctf, changelog]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 知识库更新日志

## 2024-2025 年度大更新

### 新增专题（9个）

#### Anti-analysis（1个）
- [反虚拟机与反沙箱技术](./anti-analysis/anti-vm-sandbox.md) - CPUID检测、硬件指纹、绕过策略

#### Reversing（7个）
- [控制流平坦化识别与反混淆](./reversing/control-flow-flattening.md) - OLLVM风格混淆处理
- [符号执行入门](./reversing/symbolic-execution.md) - angr/Z3求解约束
- [Rust二进制分析](./reversing/rust-binary-analysis.md) - Rust运行时特征与字符串提取
- [Go二进制分析](./reversing/go-binary-analysis.md) - Go内存布局与pclntab恢复
- [RSA算法识别与密钥提取](./reversing/rsa-algorithm-identification.md) - 大数运算识别与密钥恢复
- [Hash算法识别与验证逻辑逆向](./reversing/hash-algorithm-identification.md) - MD5/SHA识别与攻击

#### Case Studies（2个）
- [Lua字节码反编译案例](./case-studies/reviewed/luac-challenge-case.md) - 魔改Lua OpCode还原
- [多阶段迷宫求解案例](./case-studies/reviewed/mainn-maze-case.md) - 迷宫提取与自动求解

### 内容覆盖度

| 领域 | 更新前 | 更新后 |
|-----|-------|-------|
| Anti-analysis | 4个专题 | 5个专题 |
| Reversing | 11个专题 | 17个专题 |
| Case Studies | 5个案例 | 7个案例 |
| **总计** | **20** | **29** |

### 新增技术覆盖

#### 2024-2025年技术趋势
- 控制流平坦化（已成为商业保护标准）
- 符号执行和自动化求解
- Rust/Go现代语言二进制分析
- 反虚拟机/沙箱技术
- RSA/Hash算法详细分析

#### 新增工具支持
- angr符号执行框架
- Z3 SMT求解器
- deflat/REScue反平坦化工具
- ScyllaHide/TitanHide反检测工具
- rustfilt/redress现代语言工具

### 更新索引

- [主索引(index.md)](./index.md) - 新增现象检索条目、按目标检索更新
- [Anti-analysis/README](./anti-analysis/README.md) - 添加反VM/沙箱链接
- [Reversing/README](./reversing/README.md) - 重新分类，添加新专题
- [Case-studies/README](./case-studies/README.md) - 添加新案例
- [intake.md](./intake.md) - 更新入库状态

### 新增脚本模板

1. **符号执行自动求解模板** - [符号执行入门](./reversing/symbolic-execution.md)
2. **迷宫求解框架** - [迷宫案例](./case-studies/reviewed/mainn-maze-case.md)
3. **OpCode映射生成** - [Lua案例](./case-studies/reviewed/luac-challenge-case.md)
4. **Go字符串提取** - [Go分析](./reversing/go-binary-analysis.md)
5. **Hash识别脚本** - [Hash算法](./reversing/hash-algorithm-identification.md)

### 待补充领域

- WebAssembly逆向
- JavaScript反混淆
- 固件/嵌入式逆向
- 智能合约分析
- ARM/MIPS架构分析

---

## 历史更新

### 初始版本
- 基础壳识别（UPX/Themida/VMP）
- 脱壳技术（OEP/导入表/TLS）
- 反调试基础（PEB/时间/异常）
- 字符串与简单加密（XOR/Base64）
- AES算法识别
- 线性约束求解
- 基础工作流程
## 2026-04-05 自动沉淀更新

- 新增案例: [新年快乐 案例沉淀](./case-studies/drafts/case-cda7e35f.md)
- 来源任务: `TASK-A5D79B68934C` (RE)
## 2026-04-06 自动沉淀更新

- 新增案例: [luna-333-test1 案例沉淀](./case-studies/drafts/luna-333-test1.md)
- 来源任务: `TASK-18114BBFDDEB` (RE)

## 2026-05-10 Pwn 知识库补充

- 新增专题目录: [Pwn 快速路径](./pwn/README.md)
- 新增基础条目: [栈与全局溢出基础](./pwn/overflow-basics.md)、[格式化字符串利用](./pwn/format-string.md)、[ROP 与 Shellcode](./pwn/rop-and-shellcode.md)、[堆利用与 allocator 技巧](./pwn/heap-techniques.md)、[进阶利用与交叉场景](./pwn/advanced.md)
- 新增临场速查: [Pwn 速查表](./pwn/quick-reference.md)
- 补充主索引与知识库首页，方便从现象直接跳转到 PWN 条目
