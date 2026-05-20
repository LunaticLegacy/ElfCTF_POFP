---
id: reversing-pe-data-extraction
title: PE 数据段提取
category: reversing
tags: [pe, data-section, dump, ctf, analysis]
difficulty: intermediate
status: draft
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# PE 数据段提取

## 摘要

很多自定义加密题把关键表、常量和中间状态放在 PE 的 `.data` 或 `.rdata` 段里。先把数据提出来，往往比继续追控制流更快。

## 识别信号

- 数据段里出现 256 字节查找表或规则矩阵
- 逻辑只是按固定偏移读取常量
- 程序在运行时会把数据段拷贝到堆或栈再加工

## 判断依据

- 如果核心信息来自静态表，优先做 dump，而不是整段模拟
- 对 PE 样本先核对 RVA、文件偏移和节区边界，再提取数据

## 处理思路

1. 先定位节区与 RVA
2. 再确认数据是否静态存在还是运行时生成
3. 用最小脚本读取并验证字节布局
4. 把提取结果回填到求解脚本或专题文档

## 相关内容

- [查表还原技术](./table-lookup-restoration.md)
- [Project1 自定义 AES 加密案例](../case-studies/reviewed/project1-custom-aes-case.md)
