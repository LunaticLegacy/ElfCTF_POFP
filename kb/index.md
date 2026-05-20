---
id: index
title: Knowledge Base Index
category: index.md
tags: [index.md, ctf, index, knowledge, base]
difficulty: beginner
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Knowledge Base Index

## 目录导航

- 正式知识条目：[`packers/`](./packers/)、[`unpacking/`](./unpacking/)、[`anti-analysis/`](./anti-analysis/)、[`reversing/`](./reversing/)、[`pwn/`](./pwn/)、[`strategy/`](./strategy/)、[`workflows/`](./workflows/)
- 已审核案例：[`case-studies/reviewed/`](./case-studies/reviewed/)
- 草稿案例：[`case-studies/drafts/`](./case-studies/drafts/)
- 项目元信息：[`meta/`](./meta/)

## 状态约定

- `stable`：正式条目，结构和链接应保持稳定
- `review`：可检索、可用，但仍允许持续补强
- `draft`：草稿或自动沉淀，默认不作为首轮入口

## 按现象检索

| 现象 | 优先怀疑 | 入口 |
| --- | --- | --- |
| `UPX!`、节区名异常、入口处短跳 | 常见压缩壳或轻量壳 | [UPX 壳识别](./packers/upx-identification.md) |
| 原始入口不清晰，导入表稀疏，运行后映像变化明显 | 运行时解包或内存重建 | [OEP 恢复流程](./unpacking/oep-recovery-playbook.md) |
| 一运行就退出、断点异常、时间行为异常 | 反调试或环境检查 | [反调试排查清单](./anti-analysis/anti-debug-checklist.md) |
| 字符串极少、常量碎片化、比较逻辑绕远 | 字符串隐藏、常量编码、控制流扰动 | [字符串混淆模式](./reversing/string-obfuscation-patterns.md) |
| 大量 `imul/add/sub/cmp` 重复出现，检查函数很长 | 线性约束校验器、方程组求解 | [线性约束校验器识别与求解](./reversing/linear-constraint-checkers.md) |
| 迷宫、网格、表或查找数组藏在数据段里 | 内嵌数据结构提取与离线求解 | [内嵌数据结构提取与离线求解](./reversing/embedded-structure-extraction.md) |
| 不知道先动静态还是先动态 | 流程选择不清 | [Windows PE 初筛流程](./workflows/windows-pe-triage.md) |
| 程序启动即崩溃、OD/IDA 无法附加 | PEB 反调试或 TLS Callback | [PEB BeingDebugged 检查](./anti-analysis/peb-beingdebugged-check.md) |
| 调试器设置断点后立即失效 | SEH/VEH 异常处理检测 | [异常驱动反调试](./anti-analysis/exception-driver-anti-debug.md) |
| 导入表全为哈希值或序号 | API 隐藏或自定义加载 | [导入表重建与 API 哈希恢复](./unpacking/import-table-reconstruction.md) |
| x64 程序在 x32 调试器中无法分析 | WOW64 混合架构 | [x64 调试与 WOW64 场景](./workflows/x64-debugging-workflow.md) |
| Lua/Python/.NET 字节码文件 | 脚本语言虚拟机 | [字节码与脚本运行时分析](./reversing/bytecode-script-runtime.md) |
| 程序检测到VM/Sandbox后退出 | 反虚拟机/沙箱技术 | [反虚拟机与反沙箱技术](./anti-analysis/anti-vm-sandbox.md) |
| `while(1)+switch` 状态机结构 | 控制流平坦化混淆 | [控制流平坦化识别与反混淆](./reversing/control-flow-flattening.md) |
| 序列号/迷宫需要自动求解 | 符号执行/约束求解 | [符号执行入门](./reversing/symbolic-execution.md) |
| Rust/Go 编译的二进制 | 现代语言二进制分析 | [Rust二进制分析](./reversing/rust-binary-analysis.md)、[Go二进制分析](./reversing/go-binary-analysis.md) |
| 大数运算、公钥加密结构 | RSA算法 | [RSA算法识别与密钥提取](./reversing/rsa-algorithm-identification.md) |
| 特定常量表（0x67452301等） | MD5/SHA算法 | [Hash算法识别与验证逻辑逆向](./reversing/hash-algorithm-identification.md) |
| `gets` / `memcpy` / 固定长度栈缓冲区 | 栈或全局溢出 | [栈与全局溢出基础](./pwn/overflow-basics.md) |
| `printf(user_input)` / `%p` / `%n` | 格式化字符串利用 | [格式化字符串利用](./pwn/format-string.md) |
| `tcache` / `unsorted bin` / UAF / heap menu | 堆利用 | [堆利用与 allocator 技巧](./pwn/heap-techniques.md) |

## 按目标检索

- 识别壳种：[`packers/`](./packers/)
  - [UPX 壳识别](./packers/upx-identification.md)
  - [Themida 保护特征](./packers/themida-protection-features.md)
  - [VMProtect 虚拟化识别](./packers/vmprotect-virtualization.md)
  - [自定义压缩壳识别](./packers/custom-packer-identification.md)
- 定位 OEP：[`unpacking/`](./unpacking/)
  - [OEP 恢复流程](./unpacking/oep-recovery-playbook.md)
  - [导入表重建与 API 哈希恢复](./unpacking/import-table-reconstruction.md)
  - [内存 Dump 决策流程](./unpacking/memory-dump-decision.md)
  - [TLS Callback 脱壳流程](./unpacking/tls-callback-unpacking.md)
- 排查反调试：[`anti-analysis/`](./anti-analysis/)
  - [反调试排查清单](./anti-analysis/anti-debug-checklist.md)
  - [PEB BeingDebugged 检查](./anti-analysis/peb-beingdebugged-check.md)
  - [时间检测技术](./anti-analysis/timing-detection.md)
  - [异常驱动反调试](./anti-analysis/exception-driver-anti-debug.md)
  - [反虚拟机与反沙箱技术](./anti-analysis/anti-vm-sandbox.md) review
- 处理字符串/常量隐藏：[`reversing/`](./reversing/)
  - [字符串混淆模式](./reversing/string-obfuscation-patterns.md)
  - [查表还原技术](./reversing/table-lookup-restoration.md)
  - [控制流平坦化识别与反混淆](./reversing/control-flow-flattening.md) review
- 处理方程组式校验：[`reversing/`](./reversing/)
  - [线性约束校验器识别与求解](./reversing/linear-constraint-checkers.md)
  - [符号执行入门](./reversing/symbolic-execution.md) review
- 提取地图/表/网格后离线求解：[`reversing/`](./reversing/)
  - [内嵌数据结构提取与离线求解](./reversing/embedded-structure-extraction.md)
- 处理加密算法：[`reversing/`](./reversing/)
  - [AES变种识别与解密](./reversing/aes-variant-identification.md)
  - [RSA算法识别与密钥提取](./reversing/rsa-algorithm-identification.md) review
  - [Hash算法识别与验证逻辑逆向](./reversing/hash-algorithm-identification.md) review
  - [XOR加密模式](./reversing/xor-encryption-patterns.md)
  - [Base64检测与解码](./reversing/base64-detection.md)
- 现代语言二进制分析：[`reversing/`](./reversing/)
  - [Rust二进制分析](./reversing/rust-binary-analysis.md) review
  - [Go二进制分析](./reversing/go-binary-analysis.md) review
  - [字节码与脚本运行时分析](./reversing/bytecode-script-runtime.md)
- Pwn 利用：[`pwn/`](./pwn/)
  - [Pwn 快速路径](./pwn/README.md)
  - [Pwn 速查表](./pwn/quick-reference.md)
  - [栈与全局溢出基础](./pwn/overflow-basics.md)
  - [格式化字符串利用](./pwn/format-string.md)
  - [ROP 与 Shellcode](./pwn/rop-and-shellcode.md)
  - [堆利用与 allocator 技巧](./pwn/heap-techniques.md)
  - [进阶利用与交叉场景](./pwn/advanced.md)
- 建立求解策略库：[`strategy/`](./strategy/)
  - [RE 最短可证路径策略](./strategy/re-shortest-verifiable-path.md)
  - [RE 分段解密短路策略](./strategy/re-segmented-decode-short-circuit.md)
  - [RE 局部反编译优先于全流恢复](./strategy/re-local-decompile-before-full-flow.md)
- 建立标准分析节奏：[`workflows/`](./workflows/)
  - [Windows PE 初筛流程](./workflows/windows-pe-triage.md)
  - [x64 调试流程](./workflows/x64-debugging-workflow.md)
  - [DLL 分析流程](./workflows/dll-analysis-workflow.md)
  - [从 writeup 提炼知识的半自动流程](./workflows/writeup-to-knowledge-workflow.md)
- 从题目沉淀知识：[`intake.md`](./intake.md)
- 字节码与脚本运行时：[`reversing/bytecode-script-runtime.md`](./reversing/bytecode-script-runtime.md)

## 按主题目录

- [Packagers / Protectors](./packers/)
- [Unpacking](./unpacking/)
- [Anti-analysis](./anti-analysis/)
- [Reversing](./reversing/)
- [Pwn](./pwn/)
- [Strategy](./strategy/)
- [Workflows](./workflows/)
- [Case studies](./case-studies/)
- [Templates](./templates/)

## 推荐阅读顺序

1. [RE 最短可证路径策略](./strategy/re-shortest-verifiable-path.md)
2. [RE 分段解密短路策略](./strategy/re-segmented-decode-short-circuit.md)
3. [RE 局部反编译优先于全流恢复](./strategy/re-local-decompile-before-full-flow.md)
4. [Windows PE 初筛流程](./workflows/windows-pe-triage.md)
5. [UPX 壳识别](./packers/upx-identification.md)
6. [OEP 恢复流程](./unpacking/oep-recovery-playbook.md)
7. [反调试排查清单](./anti-analysis/anti-debug-checklist.md)
8. [字符串混淆模式](./reversing/string-obfuscation-patterns.md)
9. [线性约束校验器识别与求解](./reversing/linear-constraint-checkers.md)
10. [内嵌数据结构提取与离线求解](./reversing/embedded-structure-extraction.md)
11. [符号执行入门](./reversing/symbolic-execution.md) review
12. [控制流平坦化识别与反混淆](./reversing/control-flow-flattening.md) review
13. [Pwn 快速路径](./pwn/README.md)
14. [知识入库流程](./intake.md)

## 已补充专题

以下专题已根据 `prompts/reverse/` 中的实际案例和最新技术趋势补充完成：

### Packagers / Protectors
- [UPX 壳识别](./packers/upx-identification.md) - stable
- [Themida 保护特征](./packers/themida-protection-features.md) - stable
- [VMProtect 虚拟化识别](./packers/vmprotect-virtualization.md) - stable
- [自定义压缩壳识别](./packers/custom-packer-identification.md) - stable

### Unpacking
- [OEP 恢复流程](./unpacking/oep-recovery-playbook.md) - stable
- [导入表重建与 API 哈希恢复](./unpacking/import-table-reconstruction.md) - stable
- [内存 Dump 决策流程](./unpacking/memory-dump-decision.md) - stable
- [TLS Callback 脱壳流程](./unpacking/tls-callback-unpacking.md) - stable

### Anti-analysis
- [反调试排查清单](./anti-analysis/anti-debug-checklist.md) - stable
- [PEB BeingDebugged 检查](./anti-analysis/peb-beingdebugged-check.md) - stable
- [时间检测技术](./anti-analysis/timing-detection.md) - stable
- [异常驱动反调试](./anti-analysis/exception-driver-anti-debug.md) - stable
- [反虚拟机与反沙箱技术](./anti-analysis/anti-vm-sandbox.md) - review（2024-2025）

### Reversing
- [字符串混淆模式](./reversing/string-obfuscation-patterns.md) - stable
- [线性约束校验器识别与求解](./reversing/linear-constraint-checkers.md) - stable
- [内嵌数据结构提取与离线求解](./reversing/embedded-structure-extraction.md) - stable
- [查表还原技术](./reversing/table-lookup-restoration.md) - stable
- [字节码与脚本运行时分析](./reversing/bytecode-script-runtime.md) - stable
- [控制流平坦化识别与反混淆](./reversing/control-flow-flattening.md) - review（2024-2025）
- [符号执行入门](./reversing/symbolic-execution.md) - review（2024-2025）
- [Rust二进制分析](./reversing/rust-binary-analysis.md) - review（2024-2025）
- [Go二进制分析](./reversing/go-binary-analysis.md) - review（2024-2025）
- [RSA算法识别与密钥提取](./reversing/rsa-algorithm-identification.md) - review（2024-2025）
- [Hash算法识别与验证逻辑逆向](./reversing/hash-algorithm-identification.md) - review（2024-2025）

### Pwn
- [Pwn 快速路径](./pwn/README.md) - 新增专题入口
- [Pwn 速查表](./pwn/quick-reference.md) - 新增临场参考
- [栈与全局溢出基础](./pwn/overflow-basics.md) - stable
- [格式化字符串利用](./pwn/format-string.md) - stable
- [ROP 与 Shellcode](./pwn/rop-and-shellcode.md) - stable
- [堆利用与 allocator 技巧](./pwn/heap-techniques.md) - stable
- [进阶利用与交叉场景](./pwn/advanced.md) - stable

### Workflows
- [Windows PE 初筛流程](./workflows/windows-pe-triage.md) - stable
- [x64 调试流程](./workflows/x64-debugging-workflow.md) - stable
- [DLL 分析流程](./workflows/dll-analysis-workflow.md) - stable
- [从 writeup 提炼知识的半自动流程](./workflows/writeup-to-knowledge-workflow.md) - stable

### Case Studies
- [L00K_at_h3r3 脱壳案例笔记](./case-studies/reviewed/l00k-at-h3r3-unpack-notes.md) - stable
- [re2 线性校验案例笔记](./case-studies/reviewed/re2-linear-check-notes.md) - stable
- [peek_stack MSVC 字符串分析案例](./case-studies/reviewed/peek-stack-case-study.md) - stable
- [Project1 自定义 AES 加密案例](./case-studies/reviewed/project1-custom-aes-case.md) - stable
- [monster_invasion 基础字符加密案例](./case-studies/reviewed/monster-invasion-case.md) - stable
- [Lua字节码反编译案例](./case-studies/reviewed/luac-challenge-case.md) - review
- [多阶段迷宫求解案例](./case-studies/reviewed/mainn-maze-case.md) - review
- [新年快乐 案例沉淀](./case-studies/drafts/case-cda7e35f.md) - 自动沉淀案例
- [luna-333-test1 案例沉淀](./case-studies/drafts/luna-333-test1.md) - 自动沉淀案例

## 技术趋势更新（2024-2025）

根据最新逆向工程技术发展，以下领域已补充：

### 新兴保护技术
- 控制流平坦化已成为商业保护器标准配置
- 无跟踪去虚拟化工具（Pushan）出现
- LLVM混淆框架持续发展（XuanJia等）

### 新语言支持
- Rust二进制在CTF和恶意软件中显著增多
- Go二进制分析需求持续增长
- WebAssembly逆向技术成熟

### AI辅助分析
- 大语言模型用于函数名恢复
- 自动化去混淆工具
- 符号执行与动态分析结合

### 检测对抗升级
- CPUID计时检测
- 反虚拟机/沙箱技术多层化
- 硬件指纹绑定

## 待补空白

- [ ] WebAssembly逆向专题
- [ ] JavaScript反混淆专题
- [ ] 固件/嵌入式逆向专题
- [ ] 智能合约逆向专题
- [ ] ARM/MIPS架构分析专题
