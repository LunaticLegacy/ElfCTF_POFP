---
id: reversing-xor-encryption-patterns
title: XOR 加密模式识别
category: reversing
tags: [reversing, ctf, xor, encryption, patterns, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# XOR 加密模式识别

## 适用场景

- CTF 逆向题目中的简单加密
- 恶意软件字符串解密
- 固件/配置文件解密
- 协议分析中的数据包解密

## 识别信号

### 1. 汇编特征

**单字节 XOR**：
```assembly
; 简单循环 XOR
mov ecx, length
mov bl, key         ; 密钥在 BL 寄存器

xor_loop:
    mov al, byte [data + ecx - 1]
    xor al, bl      ; 与密钥异或
    mov byte [data + ecx - 1], al
    loop xor_loop
```

**寄存器作为密钥**：
```assembly
movzx eax, byte [input + i]
xor eax, edx        ; EDX 包含密钥
mov [output + i], al
```

**立即数密钥**：
```assembly
xor eax, 0x5a       ; 常见密钥: 0x41 ('A'), 0x42 ('B'), 0x5a ('Z')
xor eax, 0x13       ; 常见密钥: 0x13, 0x37 ('7'), 0x69 ('i')
```

### 2. 代码特征

```c
// 单字节 XOR 加密
void xor_encrypt(unsigned char *data, int len, unsigned char key) {
    for (int i = 0; i < len; i++) {
        data[i] ^= key;
    }
}

// 多字节密钥（重复）
void xor_encrypt_multi(unsigned char *data, int len, 
                       unsigned char *key, int key_len) {
    for (int i = 0; i < len; i++) {
        data[i] ^= key[i % key_len];
    }
}
```

## 判断依据

### 1. XOR 加密特征

**数学特性**：
- 对称性：`A ^ B = C`，则 `C ^ B = A`
- 自逆性：`A ^ A = 0`，`A ^ 0 = A`
- 交换律：`A ^ B = B ^ A`

**统计特征**：
- 密文与明文具有相同的字节分布特征
- 高频字符（如空格 0x20）会在密文中产生可识别模式

### 2. 常见密钥

| 密钥 | 类型 | 常见场景 |
|-----|------|---------|
| 0x41 ('A') | 单字节 | 简单混淆 |
| 0x5a ('Z') | 单字节 | 字符串加密 |
| 0x13 | 单字节 | 特定混淆工具 |
| 0x37 | 单字节 | 常见默认值 |
| 0x69 | 单字节 | 恶意软件常用 |
| 0xdeadbeef | 多字节 | 魔法数字 |

## 处理思路

### 1. 单字节 XOR 暴力破解

```python
def xor_decrypt(data, key):
    """单字节 XOR 解密"""
    if isinstance(key, int):
        return bytes([b ^ key for b in data])
    return bytes([b ^ key[i % len(key)] for i, b in enumerate(data)])

def brute_xor_single(data, top_n=5):
    """暴力破解单字节 XOR 密钥"""
    results = []
    
    for key in range(256):
        decrypted = xor_decrypt(data, key)
        score = score_text(decrypted)
        results.append((key, decrypted, score))
    
    # 按得分排序，返回 Top N
    results.sort(key=lambda x: x[2], reverse=True)
    return results[:top_n]

def score_text(data):
    """给解密结果打分"""
    if len(data) == 0:
        return 0
    
    # 可打印字符比例
    printable = sum(1 for b in data if 32 <= b <= 126)
    ratio = printable / len(data)
    
    # 空格频率加分
    spaces = data.count(32) / len(data)
    
    # 字母频率加分
    letters = sum(1 for b in data if 65 <= b <= 90 or 97 <= b <= 122)
    letter_ratio = letters / len(data)
    
    return ratio * 0.5 + spaces * 0.3 + letter_ratio * 0.2

# 使用示例
encrypted = bytes.fromhex('e7a798e5af86e58fa3e4bba432303235')
results = brute_xor_single(encrypted)
for key, decrypted, score in results:
    print(f"Key 0x{key:02x}: {decrypted.hex()} (score: {score:.2f})")
```

### 2. 多字节 XOR 破解（已知密钥长度）

```python
def crack_multi_byte_xor(data, key_len):
    """破解已知长度的多字节 XOR 密钥"""
    key = []
    
    # 对每个密钥位置单独破解
    for i in range(key_len):
        # 提取该位置的所有字节
        sub_data = data[i::key_len]
        # 使用单字节破解
        best_key = brute_xor_single(sub_data, top_n=1)[0][0]
        key.append(best_key)
    
    return bytes(key)

# 使用频率分析
def crack_xor_frequency(data):
    """使用频率分析破解 XOR"""
    # 假设空格 (0x20) 是最常见字符
    most_common = max(set(data), key=data.count)
    key = most_common ^ 0x20  # 假设解密后是空格
    return key
```

### 3. 自动化识别工具

```python
#!/usr/bin/env python3
"""XOR 加密自动识别与破解工具"""

import re
import string
from collections import Counter

class XORAnalyzer:
    COMMON_KEYS = [0x00, 0x01, 0x13, 0x37, 0x41, 0x42, 0x5a, 0x69, 0x7f, 0xff]
    
    def __init__(self):
        self.printable_chars = set(bytes(string.printable, 'ascii'))
    
    def analyze(self, data):
        """分析数据，返回可能的 XOR 加密信息"""
        results = {
            'likely_xor': False,
            'single_byte_candidates': [],
            'multi_byte_hints': [],
        }
        
        # 单字节 XOR 检测
        candidates = self.crack_single_byte(data)
        results['single_byte_candidates'] = candidates[:5]
        
        # 如果高得分解密结果多，可能是 XOR 加密
        if candidates and candidates[0][2] > 0.8:
            results['likely_xor'] = True
        
        return results
    
    def crack_single_byte(self, data):
        """尝试所有单字节密钥"""
        results = []
        
        for key in range(256):
            decrypted = bytes([b ^ key for b in data])
            score = self.score_decryption(decrypted)
            results.append((key, decrypted, score))
        
        results.sort(key=lambda x: x[2], reverse=True)
        return results
    
    def score_decryption(self, data):
        """评估解密结果的质量"""
        if len(data) == 0:
            return 0
        
        # 可打印字符比例
        printable_count = sum(1 for b in data if b in self.printable_chars)
        printable_ratio = printable_count / len(data)
        
        # 检查常见英文单词
        try:
            text = data.decode('ascii', errors='ignore').lower()
            common_words = ['the', 'and', 'flag', 'ctf', 'password', 'secret']
            word_score = sum(1 for word in common_words if word in text) / len(common_words)
        except:
            word_score = 0
        
        # 空格和字母频率
        spaces = data.count(32) / len(data)
        letters = sum(1 for b in data if 65 <= b <= 90 or 97 <= b <= 122) / len(data)
        
        return printable_ratio * 0.4 + word_score * 0.3 + spaces * 0.15 + letters * 0.15
    
    def find_xor_in_binary(self, binary_data, min_length=8):
        """在二进制数据中查找可能的 XOR 加密字符串"""
        found = []
        
        # 搜索连续的加密数据
        for i in range(len(binary_data) - min_length):
            chunk = binary_data[i:i + min_length]
            candidates = self.crack_single_byte(chunk)
            
            if candidates[0][2] > 0.85:
                key, decrypted, score = candidates[0]
                found.append({
                    'offset': i,
                    'key': hex(key),
                    'decrypted': decrypted,
                    'score': score
                })
        
        return found


# 使用示例
if __name__ == "__main__":
    analyzer = XORAnalyzer()
    
    # 测试数据
    test_data = bytes([0x5a ^ ord(c) for c in "Hello, World!"])
    
    results = analyzer.analyze(test_data)
    print(f"Likely XOR: {results['likely_xor']}")
    print("\nTop candidates:")
    for key, decrypted, score in results['single_byte_candidates'][:3]:
        print(f"  Key {hex(key)}: {decrypted} (score: {score:.2f})")
```

## 常见误区

### 误区 1：忽略多字节密钥
- ❌ 只尝试单字节密钥
- ✅ 如果单字节失败，尝试常见的多字节密钥长度（2, 4, 8, 16）

### 误区 2：误判密钥
- ❌ 只选择得分最高的结果
- ✅ 人工验证前几个高得分结果

### 误区 3：编码混淆
- ❌ 直接对字符串进行 XOR
- ✅ 确保统一编码（建议全部转为 bytes）

### 误区 4：忽略数据的上下文
- ❌ 随机选择数据段尝试 XOR
- ✅ 优先分析字符串表、数据段中的高熵数据

## 与其他加密的关系

| 加密类型 | 关系 | 区分方法 |
|---------|------|---------|
| Caesar | 都是单字节操作 | XOR 是自逆的，Caesar 不是 |
| RC4 | 使用 XOR 作为输出 | RC4 有密钥调度阶段 |
| AES | 不直接使用 | AES 内部有 XOR 操作（AddRoundKey） |
| Vigenère | 多字节 Caesar | XOR 使用异或，Vigenère 使用加法 |

## 相关工具或脚本

| 工具 | 用途 | 链接 |
|-----|------|-----|
| XORSearch | 在二进制中搜索 XOR 字符串 | https://blog.didierstevens.com/programs/xorsearch/ |
| xortool | 自动化 XOR 分析 | https://github.com/hellman/xortool |
| CyberChef | 在线 XOR 解密 | https://gchq.github.io/CyberChef/ |
| xordec | 批量 XOR 解密 | 自定义脚本 |

## 参考案例

- [peek_stack 案例](../case-studies/reviewed/peek-stack-case-study.md) - XOR 0x5a 加密识别
