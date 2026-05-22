---
id: workflows-writeup-to-knowledge-workflow
title: 从 Writeup 提炼知识的半自动流程
category: workflows
tags: [workflows, ctf, writeup, to, knowledge, workflow, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 从 Writeup 提炼知识的半自动流程

## 适用场景

- 将 CTF writeup 沉淀为可复用知识
- 构建逆向工程知识库
- 自动化知识提取和分类

## 流程概述

```
Writeup 源材料
    ↓
[解析与提取]
    ↓
结构化数据 (knowledge_card.json)
    ↓
[抽象与归纳]
    ↓
知识库条目
    ↓
[索引更新]
    ↓
可检索知识库
```

## 输入材料规范

### 标准 Writeup 结构

每个 writeup 应包含以下部分：

```markdown
# 题目名称

## 基本信息
- 类型: 逆向/加壳/反调试
- 平台: Windows/Linux
- 保护: UPX/VMP/自定义壳
- 工具: IDA/x64dbg/...

## 分析过程
1. 初步侦察
2. 静态分析
3. 动态调试
4. 算法还原

## 关键发现
- 技术点1: ...
- 技术点2: ...

## 解题步骤
1. ...
2. ...

## 可复用知识
- 模式: ...
- 工具: ...
- 技巧: ...
```

### knowledge_card.json 格式

```json
{
  "challenge": {
    "name": "题目名称",
    "category": "逆向/加壳/反调试/...",
    "platform": "Windows/Linux",
    "difficulty": "简单/中等/困难"
  },
  "protection": {
    "packer": "UPX/VMProtect/Themida/自定义",
    "anti_analysis": ["反调试", "反虚拟机", "字符串混淆"],
    "obfuscation": ["控制流平坦化", "字符串加密"]
  },
  "techniques": [
    {
      "name": "技术名称",
      "description": "技术描述",
      "applicability": "适用场景",
      "indicators": ["识别信号1", "识别信号2"],
      "tools": ["工具1", "工具2"],
      "references": ["参考链接"]
    }
  ],
  "tools_used": ["IDA Pro", "x64dbg", "..."],
  "extracted_knowledge": [
    {
      "type": "pattern",
      "content": "可复用的模式或技巧",
      "tags": ["标签1", "标签2"]
    }
  ],
  "related_entries": ["知识库条目1", "知识库条目2"]
}
```

## 自动化提取流程

### 步骤1: Writeup 解析

```python
def parse_writeup(writeup_path):
    """解析 markdown writeup 提取结构化信息"""
    content = read_file(writeup_path)
    
    # 提取基本信息
    challenge_info = extract_challenge_info(content)
    
    # 提取技术点
    techniques = extract_techniques(content)
    
    # 提取工具
    tools = extract_tools(content)
    
    # 提取可复用知识
    knowledge = extract_knowledge(content)
    
    return {
        "challenge": challenge_info,
        "techniques": techniques,
        "tools": tools,
        "knowledge": knowledge
    }
```

### 步骤2: 知识抽象

将具体案例抽象为通用知识：

```
案例描述:
"在这个题目中，程序使用了 PEB.BeingDebugged 检查，
通过 mov eax, fs:[0x30] 读取 PEB，然后检查 byte ptr [eax+2]"

抽象为知识条目:
- 适用场景: 识别 PEB 反调试
- 识别信号: fs:[0x30] 访问，[eax+2] 检查
- 判断依据: BeingDebugged 字段为 1 表示被调试
- 处理思路: Patch PEB+2 为 0，或使用 ScyllaHide
```

### 步骤3: 生成知识库条目

根据模板自动生成条目：

```python
def generate_kb_entry(knowledge_item):
    """根据提取的知识生成知识库条目"""
    template = load_template(knowledge_item['type'])
    
    entry = template.format(
        scenario=knowledge_item['scenario'],
        indicators=knowledge_item['indicators'],
        basis=knowledge_item['basis'],
        approach=knowledge_item['approach'],
        pitfalls=knowledge_item.get('pitfalls', []),
        tools=knowledge_item.get('tools', []),
        references=knowledge_item.get('references', [])
    )
    
    return entry
```

## 知识库索引更新

### 索引结构

```json
{
  "by_phenomenon": {
    "现象描述": ["相关条目1", "相关条目2"]
  },
  "by_goal": {
    "目标": ["相关条目"]
  },
  "by_protection": {
    "保护类型": ["相关条目"]
  },
  "by_technique": {
    "技术名称": ["相关条目"]
  }
}
```

### 自动索引更新

```python
def update_index(new_entry):
    """更新知识库索引"""
    index = load_index()
    
    # 按现象索引
    for phenomenon in new_entry.phenomena:
        index['by_phenomenon'].setdefault(phenomenon, []).append(new_entry.id)
    
    # 按目标索引
    for goal in new_entry.goals:
        index['by_goal'].setdefault(goal, []).append(new_entry.id)
    
    # 按保护类型索引
    for protection in new_entry.protections:
        index['by_protection'].setdefault(protection, []).append(new_entry.id)
    
    save_index(index)
```

## 质量控制

### 条目审核清单

- [ ] 适用场景描述清晰
- [ ] 识别信号具体可观测
- [ ] 判断依据有技术支撑
- [ ] 处理思路可操作
- [ ] 常见误区有实际案例
- [ ] 工具推荐有版本信息
- [ ] 参考案例可追溯到源

### 避免的问题

| 问题 | 解决方案 |
|------|----------|
| 过度抽象 | 保留具体代码示例 |
| 缺乏边界 | 明确说明不适用场景 |
| 工具过时 | 定期更新工具版本 |
| 案例缺失 | 每个条目关联实际案例 |

## 工具推荐

| 工具 | 用途 |
|------|------|
| **Python + BeautifulSoup** | Writeup HTML 解析 |
| **PyYAML/Markdown** | 格式转换 |
| **Jinja2** | 模板渲染 |
| **Git** | 版本控制 |
| **GitHub Actions** | 自动索引更新 |

## 半自动流程脚本示例

```bash
#!/bin/bash
# knowledge_intake.sh

WRITEUP_DIR="$1"
OUTPUT_DIR="kb/case-studies"

for writeup in "$WRITEUP_DIR"/*/writeup.md; do
    # 解析 writeup
    python scripts/parse_writeup.py "$writeup" > /tmp/extracted.json
    
    # 生成知识库条目
    python scripts/generate_kb_entry.py /tmp/extracted.json > "$OUTPUT_DIR/$(basename $(dirname $writeup)).md"
    
    # 更新索引
    python scripts/update_index.py "$OUTPUT_DIR/$(basename $(dirname $writeup)).md"
done

# 重新生成总索引
python scripts/generate_index.py > kb/index.md
```

## 参考模板

### 知识条目模板

见 [../templates/knowledge-entry-template.md](../templates/knowledge-entry-template.md)

### 案例研究模板

见 [../templates/case-study-template.md](../templates/case-study-template.md)

## 参考资源

- 本项目 `intake.md` 文件
- `templates/` 目录下的模板文件
- 已有的案例研究示例
