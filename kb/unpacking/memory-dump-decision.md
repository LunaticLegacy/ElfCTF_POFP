---
id: unpacking-memory-dump-decision
title: 内存 Dump 决策流程
category: unpacking
tags: [unpacking, ctf, memory, dump, decision, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 内存 Dump 决策流程

## 适用场景

| 场景 | 说明 |
|------|------|
| 文件脱壳失败 | 静态脱壳工具无法处理自定义壳 |
| 多层/虚拟化保护 | VMProtect、Themida 等需要动态分析 |
| 内存注入攻击 | 分析进程注入、Process Hollowing |
| 恶意软件分析 | 自动提取内存中的 payload |
| 快速批量分析 | 需要自动化处理大量样本 |

## 识别信号

### 内存 Dump vs 文件脱壳对比

```
文件脱壳（静态）：                    内存 Dump（动态）：
┌─────────────────────┐              ┌─────────────────────┐
│ 1. 分析壳算法        │              │ 1. 运行程序到 OEP    │
│ 2. 编写逆向算法      │              │ 2. 等待壳自行解密    │
│ 3. 解密原始代码      │              │ 3. 从内存提取映像    │
│ 4. 重建 PE 结构      │              │ 4. 修复 PE 头        │
└─────────────────────┘              └─────────────────────┘

优势：无需执行恶意代码               优势：通用性强，无需分析壳算法
劣势：复杂壳难以逆向                 劣势：需要安全执行环境
```

### 最佳 Dump 时机判断

```
判断标准：

1. 熵值变化检测
   - 计算 .text 节熵值
   - 熵值从高（加密）→ 低（解密完成）时 dump

2. API 调用模式
   - 程序开始调用原始代码中的 API
   - 从壳 API（LoadLibrary/GetProcAddress）转向功能 API

3. OEP 特征
   - 识别编译器入口特征（VC++、Delphi、VB 等）
   - 出现典型的初始化代码序列

4. 内存访问模式
   - 解密循环结束
   - 大量对原始代码区域的跳转
```

## 判断依据

### 映像完整性检查

```
Dump 后需要验证的要点：

1. PE 头完整性
   - MZ 头和 PE 签名
   - File Header 和 Optional Header
   - Section Headers

2. 节区对齐
   - Raw Address 应与 Virtual Address 对齐
   - Raw Size 和 Virtual Size 合理

3. 导入表有效性
   - IAT 包含有效 API 地址
   - 导入描述符结构正确

4. 入口点有效性
   - EP 指向代码节
   - EP 处代码可反汇编为有效指令
```

## 处理思路

### 步骤 1：选择 Dump 方法

```
决策树：

样本是否可执行？
├── 是，且为已知壳（UPX/ASPack）
│   └── 尝试：通用脱壳工具（UPX -d）
│
├── 是，但为未知/自定义壳
│   └── 选择：手动调试 + Scylla Dump
│       1. x64dbg 打开样本
       2. 定位 OEP
       3. Scylla 插件 Dump
│
├── 是，且为强保护（VMP/Themida）
│   └── 选择：自动化工具
│       - HollowsHunter /pe-sieve
│       - 配合 TinyTracer 定位 OEP
│
└── 需要分析注入行为
    └── 选择：内存扫描工具
        - Process Hacker 查看内存区域
        - pe-sieve 扫描进程
```

### 步骤 2：使用 Scylla 手动 Dump

```
操作流程：

1. 准备工作
   - 在虚拟机中运行调试器
   - 配置 x64dbg Events（TLS、System Breakpoint 等）

2. 定位 OEP
   - ESP 定律 / 内存断点 / API 断点
   - 确认到达原始代码入口

3. 执行 Dump
   - 打开 Scylla 插件
   - 确认 OEP 地址
   - IAT Autosearch → Get Imports
   - 点击 "Dump" 保存

4. 修复 Dump
   - Fix Dump 选择刚才的文件
   - 生成最终可执行文件

5. 验证
   - 运行脱壳后程序
   - 使用 IDA/x64dbg 检查完整性
```

### 步骤 3：使用自动化工具

```
HollowsHunter 使用示例：

# 基本扫描（按进程名）
hollows_hunter.exe /pname malware.exe /hooks /imp A

# 循环扫描（适合分析时间较长的样本）
hollows_hunter.exe /pname malware.exe /loop /hooks /imp A

# 扫描所有进程
hollows_hunter.exe /hooks /imp A

参数说明：
- /hooks：检测内存钩子/补丁
- /imp A：自动重建导入表
- /loop：循环执行直至手动停止
- /shellc：检测 shellcode
- /data：检查非可执行内存区域
```

```
PE-sieve 使用示例：

# 扫描指定 PID
pe-sieve.exe /pid 1234 /imp 3

# 参数说明：
# /imp 1 - 自动导入重建
# /imp 3 - 激进模式，尝试修复更多情况
# /dmode 3 - 解除内存映射模式
```

```
MalUnpack 使用示例：

# 自动运行并转储
mal_unpack.exe /exe sample.exe /timeout 60000
```

### 步骤 4：修复 Dump 后的 PE

```
常见问题修复：

1. 节区头修复（使用 PE-bear）
   - 打开 dump 文件
   - 将 Raw Address 设置为与 Virtual Address 相同
   - 重新计算 Raw Size

2. 基址重定位
   - 如果 dump 时的基址与 PE 头中的 ImageBase 不同
   - 修改 ImageBase 为实际加载地址
   - 或使用 Rebase 工具

3. 导入表修复
   - 使用 Scylla 的 Fix Dump 功能
   - 或 ImportREC 手动指定 IAT 范围

4. Stolen Bytes 恢复
   - 对比不同 dump 时机的内容
   - 从虚拟机内存中提取原始字节
```

## 常见问题和解决方案

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| Dump 文件无法运行 | 导入表损坏或缺失 | 使用 Scylla Fix Dump 修复 |
| 脱壳后代码不完整 | Dump 时机过早 | 等待更多解密完成后再 dump |
| 节区对齐错误 | Raw/Virtual 地址不匹配 | 使用 PE-bear 手动调整 |
| 基址错误 | ASLR 导致加载地址变化 | 修改 ImageBase 或禁用 ASLR |
| 自动化工具无输出 | 样本延迟执行或注入其他进程 | 使用 /loop 参数或增加 timeout |
| 导入表部分失效 | API 哈希或动态解析 | 使用 /imp 3 激进模式 |

## 工具对比

| 工具 | 类型 | 自动化程度 | 导入重建 | 适用场景 | 优缺点 |
|------|------|-----------|----------|----------|--------|
| **Scylla** | 插件/独立 | 半自动 | 优秀 | 通用脱壳 | 需手动定位 OEP，但重建效果好 |
| **PE-sieve** | 独立工具 | 自动 | 良好 | 进程扫描 | 轻量级，适合批量分析 |
| **HollowsHunter** | 独立工具 | 自动 | 良好 | 系统级扫描 | 基于 pe-sieve，支持多进程 |
| **MalUnpack** | 独立工具 | 全自动 | 良好 | 自动脱壳 | 自动运行样本并转储 |
| **Process Hacker** | 系统工具 | 手动 | 无 | 内存查看 | 可视化操作，适合初学者 |
| **DumpIt** | 取证工具 | 半自动 | 无 | 内存取证 | 完整的内存镜像 |
| **PE-bear** | PE 编辑器 | 手动 | 无 | PE 修复 | 强大的可视化 PE 编辑 |

## 快速参考

### 常见 OEP 特征

| 编译器 | 特征代码 | 说明 |
|--------|----------|------|
| MSVC++ | `6A 00 68 ... E8 ...` | push ebp; mov ebp, esp |
| Delphi | `55 8B EC 83 C4 ...` | 典型的栈帧设置 |
| VB6 | `68 ... 64 A1 00 00` | 对 TLS 的引用 |
| MinGW | `8B FF 55 8B EC` | 标准入口序列 |
| UPX | `pushad` / `pusha` | 压缩壳保存寄存器 |

### 常用调试命令

```
x64dbg 命令：
- bp <addr>         设置软件断点
- ba r4 <addr>      设置硬件访问断点（4字节）
- bc <index>        清除断点
- rtr               运行到返回
- mm <addr>         显示内存映射
- dump <addr>       转储内存到文件

OllyDbg 命令：
- bp <API>          在 API 上设置断点
- hr <addr>         硬件访问断点
- hw <addr>         硬件写入断点
```

## 参考资源

- **PE 格式参考**：Microsoft PE and COFF Specification
- **调试器文档**：x64dbg 官方文档 (https://help.x64dbg.com/)
- **样本分析**：Malware Analysis Series (exploitreversing.com)
- **工具仓库**：hasherezade (pe-sieve, mal_unpack, hollows_hunter)
