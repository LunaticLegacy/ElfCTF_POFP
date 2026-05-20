---
id: quick-reference
title: 知识库快速参考指南
category: QUICK_REFERENCE.md
tags: [QUICK_REFERENCE.md, ctf, quick, reference]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 知识库快速参考指南

## 🎯 我想...

### 解决一个具体问题

**现象驱动检索** → [查看索引表格](./index.md#按现象检索)

| 遇到的问题 | 直接跳转到 |
|-----------|-----------|
| 程序一运行就崩溃 | [反调试排查清单](./anti-analysis/anti-debug-checklist.md) |
| 找不到原始入口点 | [OEP 恢复流程](./unpacking/oep-recovery-playbook.md) |
| 字符串很少或乱码 | [字符串混淆模式](./reversing/string-obfuscation-patterns.md) |
| 大量数学运算和比较 | [线性约束校验器](./reversing/linear-constraint-checkers.md) |
| 有迷宫或网格数据 | [内嵌数据结构提取](./reversing/embedded-structure-extraction.md) |
| 不知道从哪开始分析 | [Windows PE 初筛流程](./workflows/windows-pe-triage.md) |

### 学习特定技术

**按主题浏览**：

#### 🔐 加密与编码
- [Caesar 密码识别](./reversing/caesar-cipher-identification.md) - review
- [XOR 加密模式](./reversing/xor-encryption-patterns.md) - stable
- [AES 变种分析](./case-studies/reviewed/project1-custom-aes-case.md) - review
- [Base64 检测](./reversing/base64-detection.md) - stable
- [查表还原技术](./reversing/table-lookup-restoration.md) - stable

#### 🛡️ 保护与脱壳
- [UPX 壳识别](./packers/upx-identification.md) - stable
- [OEP 恢复流程](./unpacking/oep-recovery-playbook.md) - stable
- [Themida 保护](./packers/themida-protection-features.md) - review
- [VMProtect 虚拟化](./packers/vmprotect-virtualization.md) - review

#### 🚫 反调试技术
- [反调试排查清单](./anti-analysis/anti-debug-checklist.md) - stable
- [PEB BeingDebugged 检查](./anti-analysis/peb-beingdebugged-check.md) - stable
- [时间检测技术](./anti-analysis/timing-detection.md) - stable
- [异常驱动反调试](./anti-analysis/exception-driver-anti-debug.md) - stable

#### 💻 工具使用
- [radare2 基础命令](./case-studies/reviewed/monster-invasion-case.md#radare2-分析技巧)
- [Python 脚本编写](./case-studies/reviewed/peek-stack-case-study.md#解题脚本编写)
- [x64dbg 调试技巧](./workflows/x64-debugging-workflow.md) - review

### 查看完整案例

**按难度排序**：

#### Easy (入门级)
1. [monster_invasion](./case-studies/reviewed/monster-invasion-case.md) - 55 分钟
   - Caesar 密码 + Base64
   - x64 基础逆向
   
2. [peek_stack](./case-studies/reviewed/peek-stack-case-study.md) - 70 分钟
   - MSVC STL + UTF-8 + XOR
   - 字符串布局分析

#### Medium (进阶级)
3. [re2-linear-check](./case-studies/reviewed/re2-linear-check-notes.md) - review
   - 线性方程组求解
   - Z3 约束应用

4. [L00K_at_h3r3](./case-studies/reviewed/l00k-at-h3r3-unpack-notes.md) - review
   - UPX 改壳脱壳
   - OEP 恢复

#### Hard (高难度)
5. [Project1](./case-studies/reviewed/project1-custom-aes-case.md) - 4 小时
   - 自定义 AES 算法
   - CBC 模式分析
   - PE 数据段 dump

### 了解分析流程

**标准工作流程** → [查看完整流程](./workflows/windows-pe-triage.md)

```
第一阶段：侦察 (15-30 min)
├─ 文件识别 (file, DIE)
├─ 静态扫描 (strings, PE 头)
└─ 初步决策 (脱壳？反调试？)

第二阶段：深入分析 (1-2 hours)
├─ 动静态结合 (IDA + x64dbg)
├─ 算法识别 (查表？约束？)
└─ 寻找突破口

第三阶段：求解验证 (30-60 min)
├─ 脚本编写 (Python/Z3)
├─ 结果验证
└─ 知识沉淀
```

### 快速查找表

#### 常见加密算法特征

| 算法 | 识别特征 | 案例链接 |
|------|----------|----------|
| XOR | 循环 + 固定密钥 | [peek_stack](./case-studies/reviewed/peek-stack-case-study.md) |
| Caesar | ASCII 位移 | [monster_invasion](./case-studies/reviewed/monster-invasion-case.md) |
| AES | S-Box (256 字节表) | [Project1](./case-studies/reviewed/project1-custom-aes-case.md) |
| Base64 | 字母表 + `=` 填充 | [monster_invasion](./case-studies/reviewed/monster-invasion-case.md) |

#### 常见保护类型特征

| 保护 | 识别信号 | 处理方案 |
|------|----------|----------|
| UPX | UPX0/UPX1 节区 | [标准脱壳](./packers/upx-identification.md) |
| Themida | 代码虚拟化 | [review](./packers/themida-protection-features.md) |
| VMProtect | .vmp0/.vmp1 节区 | [review](./packers/vmprotect-virtualization.md) |
| 自定义壳 | 非标准节区名 | [OEP 恢复](./unpacking/oep-recovery-playbook.md) |

#### 常用工具速查

| 用途 | Windows | Linux |
|------|---------|-------|
| 文件识别 | Detect It Easy | file, DIE |
| 静态分析 | IDA Pro | Ghidra, radare2 |
| 动态调试 | x64dbg | GDB+pwndbg |
| PE 查看 | PE-bear, CFF Explorer | rabin2 |
| 脱壳 | Scylla, ImportRec | manual dump |

## 📖 推荐阅读路径

### 零基础入门路径

```
Day 1-2: 基础概念
├─ [PE 文件格式简介](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)
└─ [汇编语言基础](https://www.tutorialspoint.com/assembly_programming/index.htm)

Day 3-4: 工具使用
├─ [radare2 入门](./case-studies/reviewed/monster-invasion-case.md)
└─ Python 脚本基础

Day 5-7: 实战练习
├─ [monster_invasion](./case-studies/reviewed/monster-invasion-case.md)
└─ [peek_stack](./case-studies/reviewed/peek-stack-case-study.md)
```

### 进阶提升路径

```
Week 1-2: 加密算法
├─ [AES 原理](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.197.pdf)
├─ [Project1 案例](./case-studies/reviewed/project1-custom-aes-case.md)
└─ 实现自己的 AES

Week 3-4: 保护与脱壳
├─ [OEP 恢复流程](./unpacking/oep-recovery-playbook.md)
├─ [L00K_at_h3r3 案例](./case-studies/reviewed/l00k-at-h3r3-unpack-notes.md)
└─ 收集样本练习

Week 5-6: 反调试
├─ [反调试排查清单](./anti-analysis/anti-debug-checklist.md)
└─ 学习 ScyllaHide 使用
```

### 高手修炼路径

```
Month 1: 深入研究
├─ VMProtect/Themida原理
├─ 内核级反调试
└─ 自定义虚拟机保护

Month 2: 自动化开发
├─ IDAPython 脚本开发
├─ Ghidra 插件编写
└─ 自动化工具链

Month 3: 知识输出
├─ 撰写技术博客
├─ 贡献开源项目
└─ 维护知识库
```

## 🔍 搜索技巧

### 在本知识库中搜索

**使用 grep 命令**：
```bash
# 搜索特定关键词
grep -r "AES" ./kb/

# 搜索并显示行号
grep -rn "S-Box" ./kb/

# 忽略大小写
grep -ri "xor encryption" ./kb/

# 只显示文件名
grep -rl "base64" ./kb/
```

**使用 GitHub 搜索**：
```
在 GitHub 仓库中使用：
- 关键词搜索全文
- 限定路径：path:kb/case-studies/
- 限定类型：extension:md
```

### 外部资源搜索

**Google Dorks**：
```
# 搜索 CTF writeup
site:github.com "CTF" "writeup" "reverse engineering"

# 搜索特定工具教程
"radare2" tutorial beginner

# 搜索算法实现
"AES implementation" python site:github.com
```

**专业网站**：
- [LookAtTheHardware](https://lookatthehardware.com/) - 硬件逆向
- [CrackMes.one](https://crackmes.one/) - 练习题目
- [CTF Time](https://ctftime.org/) - CTF 赛事信息

## 📞 获取帮助

### 遇到问题时

1. **先查知识库**：
   - [按现象检索](./index.md#按现象检索)
   - [快速参考首页](./README.md)

2. **搜索类似问题**：
   - Google/StackOverflow
   - GitHub Issues
   - CTF 论坛

3. **询问社区**：
   - Discord CTF 频道
   - Reddit r/ReverseEngineering
   - 看雪学院（中文）

### 报告错误

发现文档中的错误？请：
1. 记录具体位置和错误内容
2. 提供正确的信息或参考资料
3. 通过以下方式提交：
   - GitHub Issue
   - Pull Request
   - 联系维护者

## 📊 统计信息

- **总文档数**：20+ 个
- **案例研究**：5 篇（3 篇新增，2 篇已有）
- **专题页面**：6 个 README 全部更新
- **代码示例**：50+ 个
- **交叉引用**：100+ 条链接

**最新更新时间**：2026-03-28  
**当前版本**：v2.0

---

**提示**：本文档会随着知识库的完善持续更新，建议定期查看最新版本。
