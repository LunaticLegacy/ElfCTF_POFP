---
id: unpacking-readme
title: Unpacking
category: unpacking
tags: [unpacking, ctf, readme, authorized-analysis, malware-research]
difficulty: beginner
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Unpacking

## 安全边界

本目录只用于 CTF、授权分析、样本研究和防御验证。不要把其中的脱壳、导入重建或运行时提取方法用于未授权入侵、真实目标利用、持久化或规避检测。

## 正式条目

- [OEP 恢复流程](./oep-recovery-playbook.md)
- [导入表重建与 API 哈希恢复](./import-table-reconstruction.md)
- [内存 Dump 决策流程](./memory-dump-decision.md)
- [TLS Callback 脱壳流程](./tls-callback-unpacking.md)

## 延伸内容

### 导入表重建 (Import Table Reconstruction)
**内容摘要**：
- IAT 损坏识别
- API 哈希恢复技术（ROR13、CRC32）
- Scylla、ImportREC 工具使用
- 手动重建导入表流程
- HashDB 社区数据库使用

### 内存 Dump 决策 (Memory Dump Decision)
**内容摘要**：
- [内存 Dump 决策流程](./memory-dump-decision.md)
- 最佳 dump 时机判断（熵值变化、API 调用模式）
- 映像完整性检查
- Scylla、PE-sieve、HollowsHunter、MalUnpack 等工具对比

### TLS Callback 相关脱壳流程 (TLS Callback Unpacking)
**内容摘要**：
- [TLS Callback 脱壳流程](./tls-callback-unpacking.md)
- TLS Callback 反调试识别
- TLS 表定位与 patch 方法
- 调试器绕过技巧
- x64dbg/TitanHide 配置

## 通用脱壳流程

```
1. 识别壳类型
   ├─ 已知壳 → 使用专用脱壳机
   └─ 未知壳 → 转入手动分析

2. 定位 OEP
   ├─ ESP 定律
   ├─ 单步跟踪法
   ├─ 内存断点法
   └─ 交叉引用法

3. Dump 内存映像
   ├─ 使用 Scylla/PE-bear
   └─ 手动计算 SizeOfImage

4. 修复导入表
   ├─ 自动修复 (ImportREC)
   └─ 手动重建 IAT

5. 验证脱壳结果
   ├─ PE 头检查
   ├─ 导入表验证
   └─ 功能测试
```

## 工具推荐

- **Scylla** - 现代脱壳工具，支持多种保护
- **PE-bear** - PE 文件分析与修复
- **ImportRec** - 导入表重建
- **x64dbg + ScyllaHide** - 调试与反反调试
- **Process Hacker** - 进程内存查看

## 相关资源

- [UPX 壳识别](../packers/upx-identification.md)
- [TLS Callback 脱壳流程](./tls-callback-unpacking.md)
- [L00K_at_h3r3 脱壳案例](../case-studies/reviewed/l00k-at-h3r3-unpack-notes.md)
