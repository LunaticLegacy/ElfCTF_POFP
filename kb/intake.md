---
id: intake
title: 知识入库流程
category: intake.md
tags: [intake.md, ctf, intake]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 知识入库流程

这个仓库已经有大量原始材料，主要集中在 `prompts/reverse/`。入库流程的目标不是复制 writeup，而是把可复用经验抽出来。

## 可入库来源

### 主要来源
- `writeup.md` - 完整解题过程
- `knowledge_card.json` - 知识点摘要
- `metadata.json` - 题目元数据（如果存在）
- `assets/` - 求解、恢复、修补脚本
- `*.py` - 分析脚本和求解器

### 辅助来源
- 调试器截图
- 关键代码片段
- 网络资源链接
- 相关 CTF 平台题目页面

## 入库步骤详解

### Step 1: 分类识别
首先判断题目主要解决的是哪一类问题：

**保护类型**：
- [ ] 壳识别（UPX、Themida、VMProtect）
- [ ] 脱壳 / OEP 恢复
- [ ] 反调试 / 反分析
- [ ] 无保护，纯算法逆向

**算法类型**：
- [ ] 标准加密（AES、DES、RSA）
- [ ] 自定义加密
- [ ] 编码转换（Base64、Hex、URL）
- [ ] 简单变换（XOR、Caesar、位移）
- [ ] 约束求解（方程组、迷宫）

**架构类型**：
- [ ] PE32 (x86)
- [ ] PE32+ (x64)
- [ ] Linux ELF
- [ ] 字节码（.pyc、.lua、.NET）

### Step 2: 提取关键信息
从原始材料中提取"判断依据"和"决策转折点"：

**应该提取的内容**：
- ✅ 哪个函数/地址是突破口
- ✅ 使用了什么识别技巧
- ✅ 为什么选择这种解法
- ✅ 遇到了哪些坑和误判
- ✅ 脚本的核心逻辑

**不应该提取的内容**：
- ❌ 完整的 flag 计算过程（除非有教学意义）
- ❌ 重复的试错记录
- ❌ 与解题无关的环境配置细节
- ❌ 纯工具使用说明

### Step 3: 写入对应专题

根据分类，将知识写入对应的专题页：

| 主题 | 目标文件 | 示例 |
|------|----------|------|
| 壳识别 | `packers/*.md` | `upx-identification.md` |
| 脱壳 | `unpacking/*.md` | `oep-recovery-playbook.md` |
| 反调试 | `anti-analysis/*.md` | `anti-debug-checklist.md` |
| 字符串混淆 | `reversing/string-obfuscation-patterns.md` | - |
| 加密算法 | `reversing/*.md` | `aes-variant-identification.md` |
| 编码识别 | `reversing/*.md` | `base64-detection.md` |
| 工作流程 | `workflows/*.md` | `windows-pe-triage.md` |

### Step 4: 创建案例页（可选）

如果题目包含特别典型的路径或创新解法，单独新增案例页：

**案例页标准结构**：
```markdown
# 案例标题

## 来源
- 题目名称
- 原始目录
- 相关链接

## 结论摘要
- 3-5 句话概括核心解法
- 难度等级
- 知识点标签

## 关键证据
- 突破口位置
- 使用的识别技巧
- 关键数据或代码

## 可复用知识点
- 可以应用到其他场景的技术
- 识别模式和判断依据

## 误判与返工
- 走了哪些弯路
- 如何发现并纠正

## 应沉淀到的专题页
- 链接到相关知识条目

## 待补脚本或自动化点
- 已有脚本位置
- 未来改进方向
```

### Step 5: 更新索引

在对应专题页和索引页添加回链：

**需要更新的位置**：
1. `kb/index.md` - 主索引
2. 对应专题的 `README.md` - 如 `packers/README.md`
3. `case-studies/README.md` - 案例索引
4. 相关模板页 - 如有必要

**回链格式**：
```markdown
## 参考案例
- 案例名称（请替换为实际 reviewed 案例文件，例如 `./case-studies/reviewed/your-case.md`）
```

## 题目到知识的转换规则

### 抽象层级提升

**Level 1: 具体操作（不要直接抄）**
```markdown
❌ "在地址 0x401220 处调用了 XOR 指令"
```

**Level 2: 模式识别（推荐）**
```markdown
✅ "函数入口处的 XOR 循环通常表示简单加密/解密逻辑"
```

**Level 3: 通用方法（最佳）**
```markdown
✅✅ "识别 XOR 加密的三个信号：
     1. 循环结构 + 固定密钥
     2. 对称性（加密=解密）
     3. 单字节操作"
```

### 转换示例

**原始 writeup**：
> "我用 IDA 打开文件，在 main 函数里看到它调用了 sub_401220，进去一看是 XOR 加密，密钥是 0x5a。"

**转换为知识**：
> **XOR 加密函数识别**：
> - 典型模式：循环 + 单字节异或
> - IDA 特征：`for` 循环内包含 `XOR reg, imm8` 指令
> - 验证方法：输入相同数据两次，输出也相同（确定性）
> - 破解思路：暴力枚举 256 个可能密钥

### 质量检查清单

在提交前，确保：

- [ ] 没有直接复制 writeup 原文
- [ ] 包含了"为什么"而不仅是"怎么做"
- [ ] 提供了可复用的识别方法
- [ ] 记录了失败路径和误判过程
- [ ] 链接到了相关案例和脚本
- [ ] 更新了索引和交叉引用
- [ ] 语法正确，格式规范

## 建议优先入库的现有目录

根据已完成的工作，以下目录已部分入库：

### 已完成入库
- ✅ `prompts/reverse/L00K_at_h3r3/` → [L00K_at_h3r3 脱壳案例](./case-studies/reviewed/l00k-at-h3r3-unpack-notes.md)
- ✅ `prompts/reverse/peek_stack/` → [peek_stack MSVC 字符串分析](./case-studies/reviewed/peek-stack-case-study.md)
- ✅ `prompts/reverse/Project1/` → [Project1 自定义 AES 加密](./case-studies/reviewed/project1-custom-aes-case.md)
- ✅ `prompts/reverse/re2/` → [re2 线性校验案例](./case-studies/reviewed/re2-linear-check-notes.md)
- ✅ `prompts/reverse/monster_invasion/` → [monster_invasion 基础字符加密](./case-studies/reviewed/monster-invasion-case.md)
- ✅ `prompts/reverse/luac_challenge/` → [Lua字节码反编译案例](./case-studies/reviewed/luac-challenge-case.md)
- ✅ `prompts/reverse/mainn/` → [多阶段迷宫求解案例](./case-studies/reviewed/mainn-maze-case.md)

### 待入库目录
以下目录尚未系统整理，建议按优先级处理：

1. **`prompts/reverse/re_sudoku/`** - 数独算法逆向
   - 特定算法识别
   - 优先级：中

2. **`prompts/reverse/QHCTF_Challenge/`** - 综合型题目
   - 本地验证 + 远程求解
   - 优先级：中

3. **`prompts/reverse/Polar_tasks/`** - 多任务挑战
   - knowledge_card.json 已存在
   - 优先级：中

## 每次入库最少补齐的信息

对于每个新入库的案例，必须包含：

1. **题目解决的核心障碍是什么**
   - 例：识别自定义 AES 的 S-Box 修改

2. **第一条高价值线索是什么**
   - 例：数据段中的 256 字节查找表

3. **哪一步最容易误判**
   - 例：误认为是标准 AES，忽略 ShiftRows 修改

4. **哪个脚本或观察最值得复用**
   - 例：dump_tables.py 自动提取 S-Box

5. **应该归档到哪个专题页**
   - 例：[查表还原技术](./reversing/table-lookup-restoration.md)

## 推荐工作方式

### 单次工作流程
```
1. 选择一个题目目录（30 min）
   ├─ 阅读 writeup
   ├─ 查看 knowledge_card.json
   └─ 运行求解脚本

2. 提取知识点（60 min）
   ├─ 识别核心难点
   ├─ 抽象为通用方法
   └─ 编写案例研究

3. 写入知识库（30 min）
   ├─ 创建案例文件
   ├─ 更新专题 README
   └─ 更新主索引

4. 质量检查（15 min）
   ├─ 验证链接
   ├─ 检查格式
   └─ 补充截图（如有必要）
```

### 批量处理策略
如果要快速补充多个案例：

**Day 1**: 处理简单题目（Easy 级别）
- peek_stack ✓
- monster_invasion ✓
- qiandao
- r_png

**Day 2**: 处理中级题目（Medium 级别）
- Project1 ✓
- re2 ✓
- re_sudoku
- QHCTF_Challenge

**Day 3**: 处理复杂题目（Hard 级别）
- mainn
- L00K_at_h3r3 ✓
- Polar_tasks

**Day 4**: 补充专题页和索引
- 完善 reversing/README.md
- 完善 workflows/README.md
- 更新 kb/index.md

## 维护与更新

### 定期审查
- 每季度检查一次链接有效性
- 每年更新一次工具和脚本推荐
- 根据新题目持续补充案例

### 版本控制
- 使用 Git 标签标记重大更新
- 在 README 中记录变更日志
- 保持向后兼容性

## 相关资源

- [知识条目模板](./templates/knowledge-entry-template.md)
- [案例研究模板](./templates/case-study-template.md)
- [知识库索引](./index.md)
