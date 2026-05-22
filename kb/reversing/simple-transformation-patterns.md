---
id: reversing-simple-transformation-patterns
title: 简单变换模式识别
category: reversing
tags: [reversing, ctf, simple, transformation, patterns, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 简单变换模式识别

## 适用场景

- CTF 入门级逆向题目
- 字符串/数据简单加密
- 固件/配置文件中的轻度混淆
- 快速判断是否为标准加密算法

## 识别信号

### 1. Caesar 密码（位移加密）

**汇编特征**：
```assembly
add eax, 1          ; ASCII +1
sub byte [rdi], 13  ; ASCII -13 (ROT13)
```

**代码特征**：
```python
# 加密
ciphertext[i] = plaintext[i] + shift

# 解密
plaintext[i] = ciphertext[i] - shift
```

**常见位移值**：
| 位移 | 类型 | 说明 |
|-----|------|------|
| ±1 | 相邻替换 | 最简单，容易识别 |
| ±13 | ROT13 | 对称加密，加密解密相同 |
| ±32 | 大小写转换 | 仅影响字母 |
| ±47/-47 | ROT47 | 可打印 ASCII 范围 |

### 2. XOR 加密

**汇编特征**：
```assembly
xor eax, 0x5a           ; 单字节密钥
xor byte [rdi], sil     ; 多字节（密钥在寄存器）
```

**识别方法**：
```python
def xor_decrypt(data, key):
    if isinstance(key, int):  # 单字节
        return bytes([b ^ key for b in data])
    else:  # 多字节密钥
        return bytes([b ^ key[i % len(key)] for i, b in enumerate(data)])

# 单字节 XOR 暴力破解
def brute_xor_single(data):
    for key in range(256):
        decrypted = xor_decrypt(data, key)
        if is_printable(decrypted, threshold=0.8):
            yield key, decrypted
```

**XOR 特征**：
- 加密和解密使用相同操作（对称）
- 密钥为 0 时数据不变
- 连续 XOR 两次同一密钥恢复原始数据

### 3. 位操作模式

**NOT 取反**：
```assembly
not eax              ; 按位取反
; 等价于: eax = ~eax = 0xFF ^ eax
```

**AND/OR 掩码**：
```assembly
and eax, 0x0F        ; 取低 4 位
or eax, 0xF0         ; 置高 4 位
```

**循环移位**：
```assembly
rol eax, 4           ; 左循环移 4 位
ror eax, 2           ; 右循环移 2 位
```

## 判断依据

### 1. 简单变换 vs 标准加密

| 特征 | 简单变换 | 标准加密 (AES/DES) |
|-----|---------|-------------------|
| 循环结构 | 单循环，无嵌套 | 多轮循环，复杂嵌套 |
| 查表操作 | 无或极少 | 大量 S-Box 查找 |
| 常量 | 简单的数字（1, 13, 0x5a） | 复杂魔法数字 |
| 数据块大小 | 逐字节处理 | 固定块大小（16字节） |

### 2. 快速识别脚本

```python
#!/usr/bin/env python3
"""简单加密自动识别工具"""

import base64
import re
from collections import Counter

class SimpleCipherDetector:
    def __init__(self):
        self.patterns = []
    
    def analyze(self, data):
        """分析数据，返回可能的加密类型"""
        results = []
        
        # 检查是否为 Base64
        b64_result = self.check_base64(data)
        if b64_result:
            results.append(('base64', b64_result))
        
        # 检查是否为 Hex
        hex_result = self.check_hex(data)
        if hex_result:
            results.append(('hex', hex_result))
        
        # 尝试 Caesar 解密
        caesar_result = self.try_caesar(data)
        if caesar_result:
            results.append(('caesar', caesar_result))
        
        # 尝试 XOR 解密
        xor_result = self.try_xor(data)
        if xor_result:
            results.append(('xor', xor_result))
        
        return results
    
    def check_base64(self, s):
        """检查 Base64 编码"""
        if isinstance(s, bytes):
            s = s.decode('ascii', errors='ignore')
        pattern = r'^[A-Za-z0-9+/]+={0,2}$'
        if len(s) % 4 == 0 and re.match(pattern, s):
            try:
                return base64.b64decode(s)
            except:
                return None
        return None
    
    def check_hex(self, s):
        """检查 Hex 编码"""
        if isinstance(s, bytes):
            s = s.decode('ascii', errors='ignore')
        if re.match(r'^[0-9a-fA-F]+$', s) and len(s) % 2 == 0:
            try:
                return bytes.fromhex(s)
            except:
                return None
        return None
    
    def try_caesar(self, data):
        """尝试 Caesar 解密"""
        best = None
        best_score = 0
        
        if isinstance(data, str):
            data = data.encode()
        
        for shift in range(256):
            decrypted = bytes([(b - shift) % 256 for b in data])
            score = self.score_text(decrypted)
            if score > best_score:
                best_score = score
                best = (shift, decrypted, score)
        
        return best if best_score > 0.7 else None
    
    def try_xor(self, data):
        """尝试单字节 XOR 解密"""
        best = None
        best_score = 0
        
        if isinstance(data, str):
            data = data.encode()
        
        for key in range(256):
            decrypted = bytes([b ^ key for b in data])
            score = self.score_text(decrypted)
            if score > best_score:
                best_score = score
                best = (key, decrypted, score)
        
        return best if best_score > 0.7 else None
    
    def score_text(self, data):
        """计算文本得分（基于可打印字符频率）"""
        if len(data) == 0:
            return 0
        
        # 可打印字符得分
        printable = sum(1 for b in data if 32 <= b <= 126)
        ratio = printable / len(data)
        
        # 空格和字母频率加分
        spaces = data.count(32)
        letters = sum(1 for b in data if 65 <= b <= 90 or 97 <= b <= 122)
        
        return ratio * 0.5 + (spaces / len(data)) * 0.3 + (letters / len(data)) * 0.2


# 使用示例
if __name__ == "__main__":
    detector = SimpleCipherDetector()
    
    # 测试数据
    test_data = "ZmxBZ19pc2hlUmU="  # Base64
    results = detector.analyze(test_data)
    
    for cipher_type, result in results:
        print(f"Detected: {cipher_type}")
        print(f"Result: {result}")
```

## 常见误区

### 误区 1：过度复杂化
- ❌ 一上来就假设是 AES/RC4 等复杂算法
- ✅ 先检查是否为简单的 XOR/Caesar

### 误区 2：忽略编码转换
- ❌ 直接分析 Base64 字符串
- ✅ 先解码 Base64，再分析内部数据

### 误区 3：位移方向错误
- ❌ 混淆加密/解密方向
- ✅ 通过动态调试或已知明文验证

## 处理思路

```
发现可疑字符串/数据
    ↓
检查是否为 Base64/Hex/URL 编码
    ↓
尝试单字节 XOR 爆破 (256 种可能)
    ↓
尝试 Caesar 位移 (常见值优先)
    ↓
检查位操作模式 (NOT, AND, OR, ROL/ROR)
    ↓
组合变换（如先 XOR 再 Base64）
    ↓
验证结果（可打印字符比例、flag 格式）
```

## 相关工具或脚本

| 工具 | 用途 | 链接 |
|-----|------|-----|
| CyberChef | 在线编码/加密工具 | https://gchq.github.io/CyberChef/ |
| dCode | 密码学工具集合 | https://www.dcode.fr/ |
| XORSearch | XOR 字符串搜索 | https://blog.didierstevens.com/programs/xorsearch/ |
| Ciphey | 自动解密工具 | https://github.com/Ciphey/Ciphey |

## 参考案例

- [monster_invasion 案例](../case-studies/reviewed/monster-invasion-case.md) - Caesar + Base64 组合
- [peek_stack 案例](../case-studies/reviewed/peek-stack-case-study.md) - XOR 0x5a 加密
