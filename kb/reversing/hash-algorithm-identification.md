---
id: reversing-hash-algorithm-identification
title: Hash算法识别与验证逻辑逆向
category: reversing
tags: [reversing, ctf, hash, algorithm, identification, authorized-analysis, malware-research]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Hash算法识别与验证逻辑逆向

## 摘要

Hash函数（MD5、SHA系列等）用于数据完整性验证和数字签名。本文介绍常见Hash算法的识别特征、验证逻辑逆向方法和长度扩展攻击。

## 适用场景

- **保护类型**：完整性验证、序列号校验、密码存储
- **文件类型**：PE、ELF、Web应用
- **分析目标**：识别Hash类型、逆向盐值、构造碰撞
- **不适用条件**：加盐Hash且盐值未知、慢Hash（bcrypt等）

## 识别信号

### 1. 初始化常量（IV）识别

**MD5初始化常量：**
```c
uint32_t A = 0x67452301;
uint32_t B = 0xEFCDAB89;
uint32_t C = 0x98BADCFE;
uint32_t D = 0x10325476;
```

**SHA-1初始化常量：**
```c
uint32_t H0 = 0x67452301;
uint32_t H1 = 0xEFCDAB89;
uint32_t H2 = 0x98BADCFE;
uint32_t H3 = 0x10325476;
uint32_t H4 = 0xC3D2E1F0;
```

**SHA-256初始化常量：**
```c
uint32_t H[8] = {
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
};
```

**SHA-512初始化常量：**
```c
uint64_t H[8] = {
    0x6a09e667f3bcc908, 0xbb67ae8584caa73b, ...
};
```

### 2. 轮常数（K表）识别

**MD5轮常数（64个）：**
```c
// K[i] = floor(abs(sin(i + 1)) * 2^32)
const uint32_t K[64] = {
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
    0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    // ... 共64个
};
```

**SHA-256轮常数（64个）：**
```c
const uint32_t K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    // ... 共64个
};
```

### 3. 轮函数识别

**MD5轮函数：**
```c
// F(B, C, D) = (B & C) | (~B & D)  [轮1]
// G(B, C, D) = (B & D) | (C & ~D)  [轮2]
// H(B, C, D) = B ^ C ^ D           [轮3]
// I(B, C, D) = C ^ (B | ~D)        [轮4]
```

**SHA-1轮函数：**
```c
// f(t;B,C,D) = (B & C) | (~B & D)         [0 <= t <= 19]
// f(t;B,C,D) = B ^ C ^ D                  [20 <= t <= 39]
// f(t;B,C,D) = (B & C) | (B & D) | (C & D) [40 <= t <= 59]
// f(t;B,C,D) = B ^ C ^ D                  [60 <= t <= 79]
```

### 4. 标准库/API识别

**Windows CryptoAPI：**
```c
CryptCreateHash
CryptHashData
CryptGetHashParam
CryptDestroyHash

// 算法标识
CALG_MD5 = 0x00008003
CALG_SHA1 = 0x00008004
CALG_SHA_256 = 0x0000800c
```

**OpenSSL：**
```c
MD5_Init, MD5_Update, MD5_Final
SHA1_Init, SHA1_Update, SHA1_Final
SHA256_Init, SHA256_Update, SHA256_Final
EVP_MD_CTX_init
EVP_DigestInit
EVP_DigestUpdate
EVP_DigestFinal
```

**Python hashlib（编译后）：**
```c
// 函数名特征
hashlib_md5
hashlib_sha1
hashlib_sha256
hashlib_blake2b
```

### 5. Hash输出长度识别

| 算法 | 输出长度 | 字节数 | 十六进制长度 |
|-----|---------|-------|------------|
| MD5 | 128位 | 16字节 | 32字符 |
| SHA-1 | 160位 | 20字节 | 40字符 |
| SHA-256 | 256位 | 32字节 | 64字符 |
| SHA-512 | 512位 | 64字节 | 128字符 |
| MD4 | 128位 | 16字节 | 32字符 |
| CRC32 | 32位 | 4字节 | 8字符 |

## 判断依据

### 确认Hash算法的检查清单

- [ ] 存在特定的初始化常量（IV）
- [ ] 存在轮常数表（K表）
- [ ] 轮函数特征匹配（位运算组合）
- [ ] 消息扩展/调度模式匹配
- [ ] 输出长度匹配标准算法
- [ ] 使用标准库函数

### 区分相似算法

| 算法对 | 区分特征 |
|-------|---------|
| MD5 vs MD4 | MD5有第四轮，MD4只有三轮 |
| SHA-1 vs SHA-0 | SHA-0没有消息调度左移 |
| SHA-256 vs SHA-224 | 初始IV不同，SHA-224输出截断 |
| SHA-512 vs SHA-384 | 初始IV不同，SHA-384输出截断 |

## 处理思路

### 一、Hash算法识别

**1. 常量搜索法：**
```python
# 在二进制中搜索Hash常量
import struct

def find_hash_constants(data):
    signatures = {
        'MD5': bytes.fromhex('67452301EFCDAB8998BADCFE10325476'),
        'SHA1': bytes.fromhex('67452301EFCDAB8998BADCFE10325476C3D2E1F0'),
        'SHA256': bytes.fromhex('6a09e667bb67ae853c6ef372a54ff53a510e527f9b05688c1f83d9ab5be0cd19'),
    }
    
    found = []
    for algo, sig in signatures.items():
        if sig in data:
            found.append(algo)
    
    return found
```

**2. 使用sigsearch：**
```bash
# 使用YARA规则识别
yara hash_signatures.yar target

# 或Binwalk
binwalk -y hash target
```

**3. 动态Hook识别：**
```javascript
// Frida Hook常见Hash函数
const hash_funcs = [
    'MD5_Init', 'MD5_Update', 'MD5_Final',
    'SHA1_Init', 'SHA1_Update', 'SHA1_Final',
    'SHA256_Init', 'SHA256_Update', 'SHA256_Final'
];

hash_funcs.forEach(func => {
    try {
        var addr = Module.findExportByName(null, func);
        if (addr) {
            console.log(`Found ${func} at ${addr}`);
            Interceptor.attach(addr, {
                onEnter: function(args) {
                    console.log(`${func} called`);
                }
            });
        }
    } catch(e) {}
});
```

### 二、验证逻辑逆向

**1. 盐值提取：**
```python
# 从代码中提取硬编码盐值
def find_salt(data):
    # 搜索Hash调用附近的常量
    # 常见模式：Hash(salt + input) 或 Hash(input + salt)
    
    # 查找固定长度字符串
    salts = []
    for i in range(len(data) - 32):
        # 假设盐值是8-32字节的可打印字符串
        candidate = data[i:i+16]
        if all(0x20 <= b <= 0x7e for b in candidate):
            salts.append(candidate)
    
    return salts
```

**2. Hash链分析：**
```python
# 分析多层Hash结构
def analyze_hash_chain():
    # 常见模式：
    # H(H(input))
    # H(input + salt)
    # HMAC(key, input)
    # H(input) ^ constant
    
    # 通过Hook跟踪Hash调用序列
    call_sequence = trace_hash_calls()
    
    # 分析输入输出关系
    for call in call_sequence:
        print(f"Algorithm: {call.algo}")
        print(f"Input length: {len(call.input)}")
        print(f"Input prefix: {call.input[:16].hex()}")
```

### 三、攻击方法

**1. 彩虹表攻击（无盐）：**
```bash
# 使用预计算彩虹表
rtgen md5 loweralpha 1 8 0 10000 10000000 0
rtsort md5_loweralpha#1-8_0_10000x10000000_0.rt
rcrack md5_loweralpha#1-8_0_10000x10000000_0.rt -h target_hash

# 或使用在线服务
curl https://api.md5cracker.com/v1/decrypt?hash=5f4dcc3b5aa765d61d8327deb882cf99
```

**2. 暴力破解（短密码）：**
```python
import hashlib
import itertools

def crack_hash(target_hash, algo='md5', charset='abcdefghijklmnopqrstuvwxyz', max_len=6):
    hash_func = getattr(hashlib, algo)
    
    for length in range(1, max_len + 1):
        for candidate in itertools.product(charset, repeat=length):
            guess = ''.join(candidate)
            if hash_func(guess.encode()).hexdigest() == target_hash:
                return guess
    return None
```

**3. 长度扩展攻击：**
```python
# 针对Hash(secret + message)结构
from hashpumpy import hashpump

# 已知：hash(secret + original_message) 和 original_message长度
def length_extension_attack(original_hash, original_len, append_data):
    new_hash, new_data = hashpump(
        original_hash,
        'original_message',  # 占位符，实际不需要
        append_data,
        original_len
    )
    return new_hash, new_data
```

**4. Hash碰撞构造（CTF场景）：**
```python
# MD5快速碰撞（基于前缀）
# 使用fastcoll等工具
import subprocess

def create_md5_collision(prefix):
    with open('prefix', 'wb') as f:
        f.write(prefix)
    
    subprocess.run(['fastcoll', '-p', 'prefix', '-o', 'msg1.bin', 'msg2.bin'])
    
    with open('msg1.bin', 'rb') as f:
        msg1 = f.read()
    with open('msg2.bin', 'rb') as f:
        msg2 = f.read()
    
    return msg1, msg2
```

### 四、验证绕过

**1. 比较指令Patch：**
```asm
; 原始比较
mov ecx, [hash_result]
cmp ecx, [expected_hash]
jne fail

; Patch为恒等
nop
nop
nop
nop
nop
nop
jmp success
```

**2. 中间人修改（网络验证）：**
```python
# 拦截并修改Hash验证响应
from mitmproxy import http

def response(flow: http.HTTPFlow) -> None:
    if "verify" in flow.request.url:
        # 修改响应为验证成功
        flow.response.content = b'{"valid": true}'
```

**3. 哈希替换：**
```python
# 替换程序中的预期Hash值
# 计算自己的输入的Hash
target_hash = hashlib.md5(b'myinput').digest()

# 在二进制中定位原Hash并替换
replace_in_binary(addr, original_hash, target_hash)
```

## 常见误区

- **误区1**：Hash可逆
  - ✅ 真实情况：Hash是单向函数，理论上不可逆（除非暴力）
  
- **误区2**：MD5/SHA1已死所以不能遇到
  - ✅ 真实情况：大量遗留系统仍在使用
  
- **误区3**：加盐Hash绝对安全
  - ✅ 真实情况：盐值硬编码时仍可分析
  
- **误区4**：所有相同长度输出都是相同算法
  - ✅ 真实情况：可能存在自定义算法或截断

## 失败信号与转向条件

- **慢Hash（bcrypt/scrypt/Argon2）**：难以暴力，需寻找实现漏洞
- **多轮Hash（10000次迭代）**：计算成本高，考虑绕过而非破解
- **Hash + 加密组合**：需先逆向加密部分
- **HMAC且密钥未知**：需提取密钥或寻找其他攻击面

## 工具与脚本

### Hash分析工具

| 工具 | 功能 | 安装 |
|-----|------|------|
| hash-identifier | Hash类型识别 | pip install hashid |
| hashcat | GPU加速破解 | 官网下载 |
| John the Ripper | 密码破解 | 系统包管理器 |
| hashpump | 长度扩展攻击 | pip install hashpumpy |
| fastcoll | MD5碰撞 | 源码编译 |

### 识别脚本

**自动Hash识别：**
```python
#!/usr/bin/env python3
import hashlib
import re

def identify_hash(hash_str):
    patterns = {
        r'^[a-f0-9]{32}$': ['MD5', 'MD4', 'NTLM'],
        r'^[a-f0-9]{40}$': ['SHA1', 'MySQL5'],
        r'^[a-f0-9]{64}$': ['SHA256'],
        r'^[a-f0-9]{128}$': ['SHA512'],
        r'^\$2[aby]?\$\d+\$': ['bcrypt'],
        r'^\$argon2': ['Argon2'],
    }
    
    candidates = []
    for pattern, algos in patterns.items():
        if re.match(pattern, hash_str):
            candidates.extend(algos)
    
    return candidates

if __name__ == '__main__':
    import sys
    h = sys.argv[1]
    print(f"Possible algorithms: {identify_hash(h)}")
```

**Hashcat攻击模式：**
```bash
# 字典攻击
hashcat -m 0 -a 0 target_hash.txt wordlist.txt

# 掩码攻击（已知部分）
hashcat -m 0 -a 3 target_hash.txt "pass?l?l?l"

# 规则攻击
hashcat -m 0 -a 0 target_hash.txt wordlist.txt -r rules/best64.rule
```

## 记录规范

- **样本 hash**：
- **Hash算法**：
- **输出长度**：
- **是否加盐**：
- **盐值**：
- **攻击方法**：
- **破解时间**：

## 参考案例

- 各类CTF Hash挑战
- 软件注册码MD5验证
- Web应用密码存储分析

## 相关专题

- [线性约束校验器识别与求解](./linear-constraint-checkers.md) - 组合约束求解
- [RSA算法识别与密钥提取](./rsa-algorithm-identification.md) - 非对称加密
- [符号执行入门](./symbolic-execution.md) - 复杂验证逻辑

## 参考资源

- Hash函数对比: https://en.wikipedia.org/wiki/Comparison_of_cryptographic_hash_functions
- Hashcat文档: https://hashcat.net/wiki/
- FNV Hash: http://www.isthe.com/chongo/tech/comp/fnv/
- MD5碰撞研究: https://www.win.tue.nl/hashclash/

## 后续待补

- [ ] HMAC详细分析
- [ ] bcrypt/scrypt/Argon2分析
- [ ] 自定义Hash函数识别
- [ ] Merkle-Damgard结构详解
