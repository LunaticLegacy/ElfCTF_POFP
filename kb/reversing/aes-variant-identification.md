---
id: reversing-aes-variant-identification
title: AES 算法变种识别
category: reversing
tags: [reversing, ctf, aes, variant, identification, authorized-analysis, malware-research]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# AES 算法变种识别

## 适用场景

- CTF 中自定义 AES 加密分析
- 恶意软件加密算法逆向
- 固件加密算法识别
- 白盒 AES 分析

## 识别信号

### 1. 标准 AES 特征

**标准 S-Box（替换盒）**：
```python
SBOX_STANDARD = bytes([
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5,
    0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0,
    0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    # ... 共256字节
])
```

**标准 Rcon（轮常量）**：
```python
RCON_STANDARD = bytes([
    0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80,
    0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d, 0x9a, 0x2f,
    # ...
])
```

### 2. 汇编识别特征

**S-Box 查找**：
```assembly
; 典型 AES S-Box 查找
movzx eax, byte [state + i]    ; 读取状态字节
movzx eax, byte [sbox + rax]   ; S-Box 查找
mov byte [state + i], al       ; 写回
```

**MixColumns 特征**：
```assembly
; 使用 0x1b (x^8 + x^4 + x^3 + x + 1) 的 GF(2^8) 乘法
imul eax, edx, 0x1b            ; 关键特征!
xor ecx, eax                   ; XOR 累加
```

**ShiftRows 特征**：
```assembly
; 行移位操作（无乘法的内存移动）
mov al, [state + 1]
mov [state + 5], al            ; 第1行左移1
mov al, [state + 6]
mov [state + 10], al           ; 第2行左移2
```

### 3. 常见 AES 变种类型

| 变种类型 | 修改内容 | 识别方法 |
|---------|---------|---------|
| 自定义 S-Box | 替换 S-Box 表 | 对比标准 S-Box |
| 自定义 Rcon | 修改轮常量 | 提取并对比 Rcon |
| 修改 ShiftRows | 改变移位模式或增加 XOR | 分析行移位代码 |
| 修改 MixColumns | 改变矩阵或常数 | 分析乘法常数 |
| 减少轮数 | 非标准 10/12/14 轮 | 计数循环次数 |
| 白盒 AES | 使用查找表隐藏密钥 | 大量 256/4096 字节表 |

## 判断依据

### 1. S-Box 检测

```python
def find_sbox_candidates(data, min_confidence=0.8):
    """从数据中提取可能的 S-Box"""
    candidates = []
    
    # 滑动窗口查找 256 字节的双射表
    for i in range(len(data) - 256):
        chunk = data[i:i+256]
        
        # 检查是否为双射（每个值 0-255 恰好出现一次）
        if len(set(chunk)) == 256:
            # 对比标准 S-Box
            matches = sum(1 for a, b in zip(chunk, SBOX_STANDARD) if a == b)
            confidence = matches / 256
            
            if confidence < min_confidence:  # 不是标准 S-Box
                candidates.append({
                    'offset': i,
                    'confidence': confidence,
                    'data': chunk
                })
    
    return candidates

def generate_inv_sbox(sbox):
    """生成逆 S-Box"""
    inv_sbox = [0] * 256
    for i, v in enumerate(sbox):
        inv_sbox[v] = i
    return bytes(inv_sbox)
```

### 2. Rcon 检测

```python
def find_rcon_candidates(data):
    """查找可能的 Rcon 表"""
    candidates = []
    
    # Rcon 通常是 10-14 个 4 字节值
    for i in range(len(data) - 40):
        # 检查是否以 0x01 开头并呈 2 倍关系
        chunk = data[i:i+40]
        
        # 简单的 Rcon 检测
        expected_pattern = bytes([
            0x01, 0x00, 0x00, 0x00,
            0x02, 0x00, 0x00, 0x00,
            0x04, 0x00, 0x00, 0x00,
            # ...
        ])
        
        # 对比标准 Rcon
        matches = sum(1 for a, b in zip(chunk[:len(RCON_STANDARD)], RCON_STANDARD) if a == b)
        confidence = matches / len(RCON_STANDARD)
        
        if confidence < 1.0:
            candidates.append({
                'offset': i,
                'confidence': confidence,
                'data': chunk
            })
    
    return candidates
```

### 3. 综合识别脚本

```python
#!/usr/bin/env python3
"""AES 变种自动识别工具"""

class AESVariantDetector:
    SBOX_STANDARD = bytes([
        0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5,
        0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
        # ... 完整 S-Box
    ])
    
    RCON_STANDARD = bytes([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36])
    
    def __init__(self):
        self.inv_sbox_standard = self._generate_inv_sbox(self.SBOX_STANDARD)
    
    def analyze_binary(self, binary_path):
        """分析二进制文件中的 AES 变种"""
        with open(binary_path, 'rb') as f:
            data = f.read()
        
        results = {
            'sbox_candidates': self._find_sboxes(data),
            'rcon_candidates': self._find_rcons(data),
            'analysis': {}
        }
        
        # 分析每个 S-Box 候选
        for sbox_info in results['sbox_candidates']:
            sbox_info['type'] = self._classify_sbox(sbox_info['data'])
        
        return results
    
    def _find_sboxes(self, data):
        """查找所有可能的 S-Box"""
        candidates = []
        
        for i in range(len(data) - 256):
            chunk = data[i:i+256]
            
            # 双射检查
            if len(set(chunk)) != 256:
                continue
            
            # 计算与标准 S-Box 的相似度
            matches = sum(1 for a, b in zip(chunk, self.SBOX_STANDARD) if a == b)
            similarity = matches / 256
            
            candidates.append({
                'offset': hex(i),
                'similarity': similarity,
                'is_standard': similarity == 1.0,
                'data': chunk
            })
        
        return sorted(candidates, key=lambda x: x['similarity'])
    
    def _classify_sbox(self, sbox):
        """分类 S-Box 类型"""
        matches = sum(1 for a, b in zip(sbox, self.SBOX_STANDARD) if a == b)
        
        if matches == 256:
            return 'Standard AES'
        elif matches > 200:
            return 'Minor modification'
        elif matches > 100:
            return 'Major modification'
        else:
            return 'Custom / Unknown'
    
    def _generate_inv_sbox(self, sbox):
        """生成逆 S-Box"""
        inv = [0] * 256
        for i, v in enumerate(sbox):
            inv[v] = i
        return bytes(inv)


# 使用示例
if __name__ == "__main__":
    detector = AESVariantDetector()
    # results = detector.analyze_binary("target.exe")
    # print(results)
```

## 处理思路

### 1. 自定义 AES 解密流程

```python
from Crypto.Cipher import AES

class CustomAES:
    """自定义 AES 实现，支持修改的 S-Box/Rcon"""
    
    def __init__(self, sbox, rcon, shiftrows_modifier=None):
        self.sbox = sbox
        self.inv_sbox = self._generate_inv_sbox(sbox)
        self.rcon = rcon
        self.shiftrows_modifier = shiftrows_modifier
    
    def decrypt(self, ciphertext, key, iv=None):
        """使用自定义参数解密"""
        # 密钥扩展
        round_keys = self._key_expansion(key)
        
        # 分块处理
        blocks = [ciphertext[i:i+16] for i in range(0, len(ciphertext), 16)]
        plaintext = b''
        
        prev_block = iv
        for block in blocks:
            # 解密单块
            decrypted = self._decrypt_block(block, round_keys)
            
            # CBC 模式
            if iv is not None:
                plaintext += bytes([a ^ b for a, b in zip(decrypted, prev_block)])
                prev_block = block
            else:
                plaintext += decrypted
        
        return plaintext
    
    def _key_expansion(self, key):
        """自定义密钥扩展"""
        # 使用自定义 Rcon 和 S-Box
        # 实现略...
        pass
    
    def _decrypt_block(self, block, round_keys):
        """解密单块"""
        # AddRoundKey
        state = self._add_round_key(block, round_keys[-1])
        
        # 9 轮（AES-128）
        for i in range(9, 0, -1):
            state = self._inv_shift_rows(state)
            if self.shiftrows_modifier:
                state = self._apply_shiftrows_modifier(state, inverse=True)
            state = self._inv_sub_bytes(state)
            state = self._add_round_key(state, round_keys[i])
            state = self._inv_mix_columns(state)
        
        # 最后一轮
        state = self._inv_shift_rows(state)
        if self.shiftrows_modifier:
            state = self._apply_shiftrows_modifier(state, inverse=True)
        state = self._inv_sub_bytes(state)
        state = self._add_round_key(state, round_keys[0])
        
        return state
```

## 常见误区

### 误区 1：直接使用标准 AES 解密
- ❌ 发现 AES 特征后直接套用标准实现
- ✅ 首先验证 S-Box 和 Rcon 是否为标准值

### 误区 2：忽略轮数修改
- ❌ 固定假设为 10 轮
- ✅ 动态计算轮数：`rounds = {16: 10, 24: 12, 32: 14}[key_size]`

### 误区 3：混淆加密方向
- ❌ 忘记区分加密/解密函数
- ✅ 通过函数名或流程判断（解密通常先 Inverse 操作）

### 误区 4：忽略工作模式
- ❌ 只实现 ECB 模式
- ✅ 检查是否有 IV、CBC、CTR 等模式特征

## 相关工具或脚本

| 工具 | 用途 | 链接 |
|-----|------|-----|
| findaes | 在二进制中查找 AES 常量 | 自定义脚本 |
| pyCryptodome | AES 实现参考 | https://pycryptodome.org |
| SageMath | 有限域计算 | https://www.sagemath.org |

## 参考案例

- [Project1 自定义 AES 加密案例](../case-studies/reviewed/project1-custom-aes-case.md) - 完整自定义 AES 分析
