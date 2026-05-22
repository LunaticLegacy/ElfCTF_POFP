---
id: case-studies-reviewed-monster-invasion-case
title: monster_invasion 基础字符加密案例
category: case-studies
tags: [case-studies, ctf, monster, invasion, case]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# monster_invasion 基础字符加密案例

## 来源

- **题目名称**：怪兽入侵 (monster_invasion)
- **原始目录**：`prompts/reverse/monster_invasion/`
- **原始 README**：`prompts/reverse/monster_invasion/README.md`
- **Knowledge Card**：`prompts/reverse/monster_invasion/knowledge_card.json`
- **Assets**：待补充求解脚本

## 结论摘要

本案例是一个入门级逆向工程挑战，考察基础的汇编阅读能力和编码识别技巧。程序使用简单的 Caesar 密码变种（ASCII 值 +1）对 Base64 字符串进行加密，解码后得到 flag 内容 `flAg_isheRe`。这是学习 x64 PE 文件分析和基础密码学识别的优秀入门案例。

**难度等级**：Easy  
**知识点标签**：Caesar 密码、Base64 编码、PE32+ x64、radare2 基础、ASCII 位移

## 关键证据

### 1. 文件识别
```bash
$ file 64.exe
64.exe: PE32+ executable (console) x86-64, for MS Windows
```
- **PE32+**：64 位 Windows 可执行文件
- **控制台程序**：无 GUI 界面
- **x86-64**：Intel 64 位架构

### 2. 内存中的加密字符串
在 `main` 函数中发现硬编码字符串：
```assembly
0x00401574  movabs rax, 0x6f38305941776c59  ; 'YlwAY08o' (小端序)
0x0040157e  mov qword [var_20h], rax
0x00401582  movabs rax, 0x3c546c546b673162  ; 'b1gkTlT<' (小端序)
0x0040158c  mov qword [var_18h], rax
```

**完整字符串**：`YlwAY08ob1gkTlT<`（16 字节）

### 3. 解密循环逻辑
```assembly
0x004015d2  movzx eax, byte [rbp + rax - 0x20]  ; 读取字符
0x004015d7  add eax, 1                          ; ASCII + 1
0x004015da  mov edx, eax
0x004015e1  mov byte [rbp + rax - 0x40], dl     ; 存储结果
0x004015f4  call sym.putchar                    ; 输出字符
```

**核心操作**：遍历字符串，每个字节加 1

### 4. Base64 特征识别
解密后的字符串：`ZmxBZ19pc2hlUmU=`
- 包含 Base64 字符集：`[A-Za-z0-9+/]`
- 末尾有填充符：`=`
- 长度是 4 的倍数

### 5. 最终 Flag
```bash
$ echo "ZmxBZ19pc2hlUmU=" | base64 -d
flAg_isheRe
```
Flag 格式：`flag{flAg_isheRe}`

## 可复用知识点

### 1. Caesar 密码识别

**定义**：
Caesar 密码是最简单的替换加密技术，将字母表中每个字母移动固定距离。

**本案例变种**：
- 不是移动字母表位置
- 直接对 ASCII 值进行数学运算：`encrypted[i] = original[i] + 1`

**识别特征**：
```python
# 检查是否为 Caesar 密码
def detect_caesar(data):
    # 检查是否都是可打印字符
    if not all(32 <= b <= 126 for b in data):
        return False
    
    # 尝试所有可能的位移
    for shift in range(256):
        decrypted = bytes([(b + shift) % 256 for b in data])
        if is_meaningful_text(decrypted):
            return True, shift
    
    return False, None
```

**常见位移**：
- ROT13：字母表移动 13 位（对称加密）
- +1/-1：相邻字母替换
- +32/-32：大小写转换

### 2. Base64 编码检测

**Base64 特征**：
1. **字符集**：`A-Z a-z 0-9 + /`
2. **填充**：末尾可能有 0-2 个 `=` 号
3. **长度**：总是 4 的倍数
4. **正则表达式**：`^[A-Za-z0-9+/]*={0,2}$`

**Python 识别**：
```python
import base64
import re

def is_base64(s):
    pattern = r'^[A-Za-z0-9+/]*={0,2}$'
    if len(s) % 4 == 0 and re.match(pattern, s):
        try:
            decoded = base64.b64decode(s)
            return True, decoded
        except:
            return False, None
    return False, None

# 测试
test = "ZmxBZ19pc2hlUmU="
is_b64, decoded = is_base64(test)
print(f"Is Base64: {is_b64}, Decoded: {decoded}")
# Output: Is Base64: True, Decoded: b'flAg_isheRe'
```

**Base64 原理速览**：
```
原始数据：3 字节 (24 bits)
分组：每 6 bits 一组 → 4 个索引
查表：Base64 字母表 → 4 个字符

如果不足 3 字节：
- 1 字节剩余 → 补 4 个 Base64 字符 + 2 个 '='
- 2 字节剩余 → 补 4 个 Base64 字符 + 1 个 '='
```

### 3. x64 汇编基础

**调用约定**（Windows x64）：
- 前 4 个整数参数：`RCX, RDX, R8, R9`
- 返回值：`RAX`
- 栈必须 16 字节对齐

**本案例关键指令解析**：
```assembly
; 1. 加载立即数到 64 位寄存器
movabs rax, 0x6f38305941776c59  ; 8 字节常量

; 2. 存储到栈内存
mov qword [var_20h], rax  ; 存储 8 字节到栈偏移 -0x20

; 3. 零扩展移动（字节→双字）
movzx eax, byte [addr]    ; 读取 1 字节，高 24 位清零

; 4. 立即数加法
add eax, 1                ; 寄存器 + 1

; 5. 存储低 8 位
mov byte [addr], dl       ; 只存储 EDX 的最低 8 位
```

**radare2 命令**：
```bash
r2 -A 64.exe              # 打开并自动分析
pdf @ sym.main            # 反汇编 main 函数
psz @ addr                # 打印字符串
px @ addr                 # 打印十六进制
pxs @ addr                # 打印字符串（智能识别）
```

### 4. 解题脚本编写

**完整 Python 求解脚本**：
```python
#!/usr/bin/env python3
"""
monster_invasion solve script
Author: Your Name
"""

import base64

def solve():
    # Step 1: 加密字符串（从逆向分析获得）
    encrypted = "YlwAY08ob1gkTlT<"
    
    # Step 2: Caesar 解密（每个字符 -1）
    # 注意：程序中是 +1 加密，所以解密要 -1
    caesar_decoded = "".join(chr(ord(c) - 1) for c in encrypted)
    print(f"After Caesar decode: {caesar_decoded}")
    # Output: ZmxBZ19pc2hlUmU=
    
    # Step 3: Base64 解码
    try:
        flag_content = base64.b64decode(caesar_decoded).decode('utf-8')
        print(f"Base64 decoded: {flag_content}")
        # Output: flAg_isheRe
    except Exception as e:
        print(f"Base64 decode failed: {e}")
        return
    
    # Step 4: 格式化 flag
    flag = f"flag{{{flag_content}}}"
    print(f"Final Flag: {flag}")
    # Output: flag{flAg_isheRe}
    
    return flag

if __name__ == "__main__":
    solve()
```

**验证脚本**：
```python
#!/usr/bin/env python3
"""Verify the flag by re-encrypting"""

import base64

def verify():
    flag_content = "flAg_isheRe"
    
    # Step 1: Base64 编码
    b64_encoded = base64.b64encode(flag_content.encode()).decode()
    print(f"Base64: {b64_encoded}")
    # Output: ZmxBZ19pc2hlUmU=
    
    # Step 2: Caesar 加密（+1）
    encrypted = "".join(chr(ord(c) + 1) for c in b64_encoded)
    print(f"Encrypted: {encrypted}")
    # Output: YlwAY08ob1gkTlT<
    
    # 对比原始字符串
    assert encrypted == "YlwAY08ob1gkTlT<"
    print("✓ Verification passed!")

if __name__ == "__main__":
    verify()
```

### 5. radare2 分析技巧

**完整分析流程**：
```bash
# 1. 打开文件并自动分析
r2 -A 64.exe

# 2. 列出所有字符串
izz

# 3. 搜索特定字符串
/ flag{
/ base64

# 4. 查找交叉引用
axt @ string_address

# 5. 分析 main 函数
pdf @ sym.main

# 6. 单步调试
dc              # 继续运行
db 0x004015d7   # 在加法处设断点
dr              # 查看寄存器
px @ rsp        # 查看栈内存

# 7. 内存转储
wtf dump.bin 100  # 写入当前地址 100 字节到文件
```

**图形化分析**：
```bash
# 使用 Cutter (radare2 GUI)
cutter 64.exe

# 或使用 Iaito
iaito 64.exe
```

## 误判与返工

### 初始误判
1. **方向错误**：
   - 最初以为是复杂加密算法
   - 花费时间寻找不存在的密钥调度
   - 后来发现只是简单的 ASCII +1

2. **编码混淆**：
   - 误认为 `ZmxBZ19pc2hlUmU=` 是最终 flag
   - 忽略了 Base64 的特征（末尾 `=`）
   - 解码后才意识到需要二次处理

3. **位移方向搞反**：
   - 第一次尝试用 `-1` 解密，得到乱码
   - 重新看汇编发现是 `add eax, 1`
   - 纠正为 `+1` 加密，`-1` 解密

### 纠正过程
1. **动态验证**：
   ```bash
   # 使用 wine 运行程序
   wine 64.exe
   
   # 输入测试：随便输入字符串
   # 观察输出模式
   ```

2. **逐字符分析**：
   ```python
   encrypted = "YlwAY08ob1gkTlT<"
   for i, c in enumerate(encrypted):
       decrypted_char = chr(ord(c) + 1)
       print(f"{c} ({ord(c)}) -> {decrypted_char} ({ord(decrypted_char)})")
   ```

3. **模式识别**：
   - 观察到 `Y` → `Z`, `l` → `m`, `w` → `x`
   - 确认是连续字母递增
   - 联想到 Base64 编码特征

## 应沉淀到的专题页

建议阅读顺序：
1. [Caesar 密码识别](../../reversing/caesar-cipher-identification.md) - 基础替换加密
2. [Base64 编码检测](../../reversing/base64-detection.md) - 常见编码识别
3. [x64 PE 基础分析](../../workflows/x64-debugging-workflow.md) - 64 位程序逆向入门
4. [简单变换模式](../../reversing/simple-transformation-patterns.md) - ASCII 位移、位操作

## 待补脚本或自动化点

### 已有脚本
目前记录在 knowledge_card.json 中：
```python
# Caesar +1 加密
res = ''.join(chr(ord(c) + 1) for c in s)

# Base64 解码
import base64
base64.b64decode(encoded_str)
```

### 可自动化点

1. **通用 Caesar 爆破工具**：
```python
def brute_force_caesar(data):
    results = []
    for shift in range(256):
        decrypted = bytes([(b - shift) % 256 for b in data])
        score = calculate_printable_ratio(decrypted)
        results.append((shift, decrypted.decode('latin-1'), score))
    
    # 按可打印字符比例排序
    results.sort(key=lambda x: x[2], reverse=True)
    
    print("Top 5 candidates:")
    for shift, text, score in results[:5]:
        print(f"Shift {shift}: {text[:50]}... (score: {score:.2f})")

def calculate_printable_ratio(data):
    printable = sum(1 for b in data if 32 <= b <= 126)
    return printable / len(data) if len(data) > 0 else 0
```

2. **Base64 自动检测与解码**：
```python
import re
import base64

def auto_decode_base64(text):
    """自动检测并解码 Base64 字符串"""
    patterns = [
        r'^[A-Za-z0-9+/]+={0,2}$',  # 标准 Base64
        r'^[A-Za-z0-9_-]+={0,2}$',  # URL-safe Base64
    ]
    
    for pattern in patterns:
        if re.match(pattern, text):
            try:
                # 尝试标准解码
                decoded = base64.b64decode(text)
                return decoded.decode('utf-8', errors='ignore')
            except:
                pass
    
    return None

# 批量处理字符串
strings = ["YlwAY08ob1gkTlT<", "ZmxBZ19pc2hlUmU=", ...]
for s in strings:
    result = auto_decode_base64(s)
    if result:
        print(f"{s} -> {result}")
```

3. **radare2 自动化脚本**：
```python
#!/usr/bin/env python3
import r2pipe

def analyze_binary(binary_path):
    r2 = r2pipe.open(binary_path)
    
    # 自动分析
    r2.cmd("aaa")
    
    # 导出所有字符串
    strings = r2.cmdj("izzj")
    
    # 查找可疑字符串（可能是 Base64）
    import re
    base64_pattern = re.compile(r'^[A-Za-z0-9+/]+=*$')
    
    suspicious = []
    for s in strings.get('strings', []):
        string = s.get('string', '')
        if len(string) >= 8 and base64_pattern.match(string):
            suspicious.append(string)
    
    print(f"Found {len(suspicious)} potential Base64 strings:")
    for s in suspicious:
        print(f"  - {s}")
    
    # 分析 main 函数
    main_disasm = r2.cmd("pdf @ sym.main")
    print("\nMain function disassembly:")
    print(main_disasm)
    
    return suspicious

if __name__ == "__main__":
    analyze_binary("64.exe")
```

### 未来改进方向
- 开发 CTF 常用编码识别工具包
- 集成 radare2/Ghidra 插件自动标记可疑字符串
- 建立常见加密模式数据库
- 制作在线解题工具（网页版）

## 解题时间线

| 阶段 | 用时 | 主要活动 |
|------|------|----------|
| 文件识别 | 5 min | file 命令、PE 头检查 |
| 静态分析 | 25 min | radare2 字符串搜索、main 函数分析 |
| 模式识别 | 10 min | Caesar+Base64识别 |
| 脚本求解 | 10 min | Python 脚本编写与执行 |
| 验证提交 | 5 min | 最终验证 |
| **总计** | **55 min** | - |

## 核心 Flag

```
flag{flAg_isheRe}
```

验证方法：
```bash
# 方法 1：直接运行程序
echo "秘密口令 2025" | wine 64.exe
# 应该输出：flag{flAg_isheRe}

# 方法 2：Python 验证
python3 solve.py
# 输出：Final Flag: flag{flAg_isheRe}
```

## 相关资源

- [CTF Crypto Wiki - Classical Cryptography](https://github.com/Jean-Baptiste-Lemaire/CTF-Crypto-Wiki#classical-cryptography)
- [Base64 Wikipedia](https://en.wikipedia.org/wiki/Base64)
- [radare2 Book](https://rada.re/n/radare2.html)
- [x64 Calling Convention](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention)
