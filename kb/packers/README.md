---
id: packers-readme
title: Packers / Protectors
category: packers
tags: [packers, ctf, readme, protectors, authorized-analysis, malware-research]
difficulty: beginner
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Packers / Protectors

## 安全边界

本目录只用于 CTF、授权分析、样本研究和防护验证。不要把其中的识别与分析方法用于未授权入侵、真实目标利用、持久化、规避检测或破坏性行为。

## 正式条目

- [UPX 壳识别](./upx-identification.md)
- [Themida 保护特征识别](./themida-protection-features.md)
- [VMProtect 虚拟化保护识别](../packers/vmprotect-virtualization.md)
- [自定义压缩壳识别](./custom-packer-identification.md)

## 延伸内容

### Themida
**内容摘要**：
- 入口点模糊化、API 加密、代码虚拟化
- 反调试技术集成（12+ 种检测方式）
- 内存转储策略
- IAT 修复方法
- 反调试绕过方案

### VMProtect
**内容摘要**：
- [VMProtect 虚拟化保护识别](../packers/vmprotect-virtualization.md)
- VMP 节区特征（.vmp0, .vmp1）
- 虚拟机架构分析
- 去虚拟化基本思路
- 保护等级与性能损耗

### 自定义压缩壳
**内容摘要**：
- [自定义压缩壳识别](./custom-packer-identification.md)
- 熵值分析方法
- 自定义 stub 分析
- 解压逻辑逆向
- 参考案例：[L00K_at_h3r3 脱壳案例笔记](../case-studies/reviewed/l00k-at-h3r3-unpack-notes.md)

## 通用识别流程

1. **初步扫描**：检查节区名、文件头、熵值
2. **入口分析**：观察入口代码模式（短跳、长跳、直接执行）
3. **导入表检查**：稀疏导入表通常表示加壳
4. **运行时行为**：调试器观察内存变化
5. **工具辅助**：使用 PEiD、Exeinfo PE、Detect It Easy 等工具

## 决策树

```
发现 PE 文件
├─ 节区名为 UPX0/UPX1 → 尝试 UPX 脱壳
├─ 节区名为 .vmp0/.vmp1 → VMProtect 保护
├─ 入口为长跳转 + 代码虚拟化 → Themida/WinLicense
├─ 节区少但熵值高 + 稀疏导入 → 自定义壳
└─ 无法识别 → 转入通用 OEP 恢复流程
```

## 相关资源

- [OEP 恢复流程](../unpacking/oep-recovery-playbook.md)
- [导入表重建](../unpacking/import-table-reconstruction.md)
- [L00K_at_h3r3 脱壳案例](../case-studies/reviewed/l00k-at-h3r3-unpack-notes.md)
