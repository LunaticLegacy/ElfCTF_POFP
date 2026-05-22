---
id: workflows-readme
title: Workflows
category: workflows
tags: [workflows, ctf, readme, authorized-analysis, malware-research]
difficulty: beginner
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Workflows

## 安全边界

本目录只描述授权分析和 CTF 的标准工作流，用于教学、样本研究和防御验证，不用于未授权攻击或规避检测。

## 正式流程

- [Windows PE 初筛流程](./windows-pe-triage.md)
- [x64 调试与 WOW64 场景](./x64-debugging-workflow.md)
- [DLL 分析流程](./dll-analysis-workflow.md)
- [从 Writeup 提炼知识的半自动流程](./writeup-to-knowledge-workflow.md)

### x64 调试流程 (x64 Debugging Workflow)
**内容摘要**：
- x64 程序调用约定（RCX, RDX, R8, R9）
- 栈帧对齐要求（16 字节对齐）
- x64 SEH 链分析（unwind 信息）
- WOW64 混合架构处理
- Heaven's Gate 技术
- 参考案例：[monster_invasion 基础字符加密案例](../case-studies/reviewed/monster-invasion-case.md)

### DLL 分析流程 (DLL Analysis Workflow)
**内容摘要**：
- DllMain 入口定位
- 导出函数分析
- rundll32 动态调试
- DLL 注入检测（经典注入、反射注入）
- 侧加载技术识别
- 内存取证检测方法

### 从 writeup 提炼知识的半自动流程 (Writeup to Knowledge Workflow)
**内容摘要**：
- writeup 结构化解析
- 知识点自动提取
- 可复用经验抽象
- 案例到模板转换
- 知识库索引更新
- 质量控制清单

## 标准分析节奏

### 第一阶段：侦察（15-30 分钟）
```
1. 文件识别
   ├─ file / Detect It Easy → 文件类型、编译器、保护
   ├─ hash 计算 → MD5/SHA1 记录
   └─ 文件大小 → 初步判断复杂度

2. 静态扫描
   ├─ strings → 可读字符串
   ├─ PE 头检查 → 节区、导入表、TLS
   └─ 熵值分析 → 加密/压缩区域

3. 决策点
   ├─ 有壳？→ 转入脱壳流程
   ├─ 强反调试？→ 准备反反调试工具
   └─ 简单混淆？→ 直接静态分析
```

### 第二阶段：深入分析（1-2 小时）
```
1. 动静态结合
   ├─ IDA/Ghidra 静态分析关键函数
   ├─ x64dbg 动态跟踪验证假设
   └─ Frida 插桩提取中间数据

2. 算法识别
   ├─ 查表 → S-Box/置换表提取
   ├─ 约束检查 → Z3 求解准备
   └─ 标准算法 → 调用现成库

3. 突破点
   ├─ 找到关键比较
   ├─ 定位解密函数
   └─ 恢复 flag 格式
```

### 第三阶段：求解与验证（30-60 分钟）
```
1. 脚本编写
   ├─ Python 复现核心逻辑
   ├─ 暴力破解（如果可行）
   └─ Z3 约束求解

2. 结果验证
   ├─ 本地运行测试
   ├─ 调试器验证
   └─ 提交 flag

3. 知识沉淀
   ├─ 更新 knowledge_card.json
   ├─ 编写 writeup
   └─ 归档到知识库
```

## 工具链配置

### 基础环境
```bash
# Windows
- IDA Pro 7.x / 8.x
- x64dbg + 插件全家桶
- PE-bear / CFF Explorer
- Python 3.8+ (pwntools, pycryptodome, z3-solver)

# Linux
- Ghidra
- radare2 / Cutter
- wine (运行 Windows 工具)
- GDB + pwndbg
```

### 调试器插件推荐
- **ScyllaHide** - 反反调试
- **CommandHook** - 自动化命令
- **MemoryViewer** - 内存结构查看
- **Graph** - 控制流图生成
- **Python** - 脚本扩展

## 质量保证清单

在结束分析前，确保完成以下检查：

- [ ] 样本 hash 已记录
- [ ] 使用的工具版本已标注
- [ ] 关键截图已保存
- [ ] 求解脚本已测试
- [ ] writeup 包含可复用知识点
- [ ] 知识库索引已更新

## 相关资源

- [知识入库流程](../intake.md)
- [案例研究模板](../templates/case-study-template.md)
- [知识条目模板](../templates/knowledge-entry-template.md)
