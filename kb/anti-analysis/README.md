---
id: anti-analysis-readme
title: Anti-analysis
category: anti-analysis
tags: [anti-analysis, ctf, readme, anti, analysis, authorized-analysis, malware-research]
difficulty: beginner
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Anti-analysis

## 安全边界

本目录只用于 CTF、授权分析、样本研究和防御验证。不要把其中的反调试、反虚拟机或环境探测方法用于未授权入侵、真实目标规避检测或持久化。

## 正式条目

- [反调试排查清单](./anti-debug-checklist.md)
- [PEB BeingDebugged 检查](./peb-beingdebugged-check.md)
- [时间检测技术](./timing-detection.md)
- [异常驱动反调试](./exception-driver-anti-debug.md)
- [反虚拟机与反沙箱技术](./anti-vm-sandbox.md)

## 补充方向

### 内核态反调试
**内容摘要**：
- SSDT Hook检测
- 驱动对象扫描
- 调试器驱动识别

## 反调试技术分类

### 1. 用户态检测
- **PEB 检查** - 读取 BeingDebugged 字段
- **API 检测** - IsDebuggerPresent, CheckRemoteDebuggerPresent
- **异常检测** - SEH/VEH 探测调试器行为
- **时间检测** - 测量代码执行时间差

### 2. 内核态检测
- **驱动检测** - 检查调试器驱动加载
- **端口扫描** - 检测调试器通信端口
- **窗口枚举** - 查找调试器窗口句柄

### 3. 环境检测
- **虚拟机检测** - VMWARE/VirtualBox 特征
- **沙箱检测** - Cuckoo/Anubis 等沙箱特征
- **用户名检测** - 默认用户名（如 "malware"）

## 通用绕过策略

```
1. 识别检测类型
   ├─ PEB 检查 → Patch BeingDebugged
   ├─ API 检测 → Hook 返回 FALSE
   ├─ 异常检测 → 配置异常处理插件
   └─ 时间检测 → 使用 SpeedUp 插件

2. 选择工具
   ├─ x64dbg + ScyllaHide
   ├─ TitanHide（内核级隐藏）
   ├─ HyperHide（虚拟化隐藏）
   └─ IDA Pro + Debugger 插件

3. 验证绕过效果
   ├─ 单步执行测试
   ├─ 断点测试
   └─ 功能完整性测试
```

## 工具推荐

- **x64dbg + ScyllaHide** - 主流反反调试组合
- **TitanHide** - 内核级调试器隐藏
- **ProcessHacker** - 查看进程 PEB 信息
- **PE-bear** - 分析 TLS Callback 等结构
- **VMProtect Disabler** - 针对 VMP 保护

## 相关资源

- [Windows PE 初筛流程](../workflows/windows-pe-triage.md)
- [OEP 恢复流程](../unpacking/oep-recovery-playbook.md)
- [PEB 结构详解](https://www.geoffchappell.com/studies/windows/km/ntoskrnl/inc/api/ntexapi_x/peb.htm)
