---
id: reversing-readme
title: Reversing
category: reversing
tags: [reversing, ctf, readme, authorized-analysis, malware-research]
difficulty: beginner
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Reversing

## 安全边界

本目录只用于 CTF、授权分析、样本研究和防御验证。不要把其中的逆向、去混淆、算法还原方法用于未授权入侵、真实目标利用、持久化或规避检测。

## 正式条目

### 基础逆向技术
- [字符串混淆模式](./string-obfuscation-patterns.md)
- [简单变换模式](./simple-transformation-patterns.md)
- [Base64 编码检测](./base64-detection.md)
- [XOR 加密模式](./xor-encryption-patterns.md)
- [UTF-8 编码识别](./utf8-encoding-detection.md)

### 高级分析技术
- [线性约束校验器识别与求解](./linear-constraint-checkers.md)
- [内嵌数据结构提取与离线求解](./embedded-structure-extraction.md)
- [MSVC std::string 内存布局](./msvc-string-layout.md)
- [AES 算法变种识别](./aes-variant-identification.md)
- [控制流平坦化识别与反混淆](./control-flow-flattening.md) - review
- [符号执行入门](./symbolic-execution.md) - review

### 现代语言二进制分析
- [Rust二进制分析](./rust-binary-analysis.md) - review
- [Go二进制分析](./go-binary-analysis.md) - review
- [字节码与脚本运行时分析](./bytecode-script-runtime.md)

### 非对称加密与Hash
- [RSA算法识别与密钥提取](./rsa-algorithm-identification.md) - review
- [Hash算法识别与验证逻辑逆向](./hash-algorithm-identification.md) - review

### 查表与加密
- [查表还原技术](./table-lookup-restoration.md)

## 补充内容

### 查表还原技术 (Table Lookup Restoration)
**内容摘要**：
- S-Box 识别与提取（AES、DES、Blowfish）
- 自定义替换表分析
- 置换表逆向
- 常量表恢复（rcon、T-Table）
- 自动化脚本编写
- 参考案例：[Project1 自定义 AES 案例](../case-studies/reviewed/project1-custom-aes-case.md)

### 字节码与脚本运行时分析 (Bytecode and Script Runtime Analysis)
**内容摘要**：
- Lua 字节码反编译（luac）
- Python .pyc 文件分析（uncompyle6、decompyle3、pycdc）
- .NET IL 反编译（dnSpy、ILSpy）
- JavaScript 混淆还原（AST-based 反混淆）
- 虚拟机指令集逆向
- 参考案例：[Lua 字节码挑战](../case-studies/reviewed/luac-challenge-case.md)

## 常见算法模式识别

### 1. 加密算法
- **AES** - S-Box、ShiftRows、MixColumns 特征
- **RSA** - 大数运算、模幂运算
- **DES/3DES** - Feistel 网络、初始置换
- **RC4** - KSA/PRGA 算法

### 2. 哈希算法
- **MD5** - 四轮循环、常量表
- **SHA1/SHA256** - 消息扩展、压缩函数
- **CRC32** - 查表法实现

### 3. 编码转换
- **Base64** - 字母表 + 填充字符 `=`
- **Hex 编码** - 0-9A-F 范围检查
- **URL 编码** - `%XX` 格式

### 4. 简单变换
- **XOR** - 异或对称性
- **Caesar** - ASCII 位移
- **ROT13** - 字母表半圈旋转
- **Bit 操作** - 移位、旋转、位反转

## 通用分析流程

```
1. 识别算法类型
   ├─ 查表操作 → S-Box/置换表
   ├─ 大量位运算 → 加密/哈希算法
   ├─ 固定常量 → 标准算法（如 MD5 常量）
   └─ 循环结构 → 迭代算法

2. 提取关键数据
   ├─ 初始化常量
   ├─ 查找表格
   ├─ 密钥调度
   └─ 中间状态

3. 编写求解脚本
   ├─ Python 复现算法
   ├─ Z3 求解约束
   └─ 暴力破解（如果可行）

4. 验证结果
   ├─ 本地测试
   ├─ 调试器验证
   └─ 在线工具对比
```

## 工具推荐

### 静态分析
- **IDA Pro** - 交互式反汇编
- **Ghidra** - NSA 开源逆向平台
- **radare2** - 命令行逆向工具
- **Binary Ninja** - 现代化二进制分析

### 动态分析
- **x64dbg/x32dbg** - Windows 调试器
- **WinDbg** - 内核/用户态调试
- **Frida** - 动态插桩工具

### 脚本与自动化
- **Python** - pwntools, pycryptodome, z3-solver
- **IDAPython** - IDA 自动化脚本
- **r2pipe** - radare2 Python 绑定

## 相关资源

- [Project1 自定义 AES 案例](../case-studies/reviewed/project1-custom-aes-case.md)
- [monster_invasion Caesar+Base64 案例](../case-studies/reviewed/monster-invasion-case.md)
- [peek_stack XOR 解密案例](../case-studies/reviewed/peek-stack-case-study.md)
- [CTF Crypto Wiki](https://github.com/Jean-Baptiste-Lemaire/CTF-Crypto-Wiki)
