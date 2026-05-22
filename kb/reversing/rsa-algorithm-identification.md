---
id: reversing-rsa-algorithm-identification
title: RSA算法识别与密钥提取
category: reversing
tags: [reversing, ctf, rsa, algorithm, identification, authorized-analysis, malware-research]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# RSA算法识别与密钥提取

## 摘要

RSA是一种非对称加密算法，广泛用于数字签名和密钥交换。本文介绍RSA在二进制中的识别特征、密钥提取方法和常见攻击场景。

## 适用场景

- **保护类型**：注册码验证、加密通信、数字签名
- **文件类型**：PE、ELF、固件
- **分析目标**：识别RSA实现、提取公钥/私钥、验证逻辑逆向
- **不适用条件**：硬件安全模块（HSM）、远程验证（服务器端私钥）

## 识别信号

### 1. 数学运算特征

**模幂运算（核心操作）：**
```c
// RSA基本公式: c = m^e mod n
// RSA解密: m = c^d mod n

// 大数模幂实现特征
result = 1
base = base % modulus
while (exponent > 0) {
    if (exponent & 1)
        result = (result * base) % modulus
    base = (base * base) % modulus
    exponent >>= 1
}
```

**汇编特征：**
```asm
; 大数乘法循环
modexp_loop:
    test rsi, 1          ; 检查指数最低位
    jz skip_multiply
    call big_multiply    ; 大数乘法
    call big_modulo      ; 大数取模
skip_multiply:
    call big_square      ; 大数平方
    call big_modulo
    shr rsi, 1           ; 右移指数
    jnz modexp_loop
```

### 2. 密钥结构特征

**公钥（n, e）：**
```
n: 模数，通常为1024-4096位大整数（256-512字节）
e: 公钥指数，通常为65537 (0x10001) 或 3 (0x3)
```

**私钥（n, d）：**
```
n: 同上
d: 私钥指数，大整数
p, q: 大素数因子（可选，用于加速）
dP, dQ, qInv: CRT参数（可选）
```

**常见e值识别：**
```hex
0x00010001  ; 65537，最常见
0x00000003  ; 3，较少见
0x00000011  ; 17
```

### 3. 标准库/API识别

**Windows CryptoAPI：**
```c
CryptImportKey      ; 导入密钥
CryptExportKey      ; 导出密钥
CryptEncrypt        ; 加密
CryptDecrypt        ; 解密
CryptSignHash       ; 签名
CryptVerifySignature ; 验证
```

**OpenSSL：**
```c
RSA_new
RSA_generate_key
RSA_public_encrypt
RSA_private_decrypt
RSA_sign
RSA_verify
BN_mod_exp          ; 大数模幂
```

**Crypto++：**
```c
RSA::PublicKey
RSA::PrivateKey
RSAES_OAEP_SHA_Encryptor
RSASS_PKCS1v15_SHA_Signer
```

**Golang crypto/rsa：**
```go
rsa.EncryptOAEP
rsa.DecryptOAEP
rsa.SignPKCS1v15
rsa.VerifyPKCS1v15
```

### 4. 密钥文件格式

**PEM格式（Base64编码）：**
```
-----BEGIN RSA PUBLIC KEY-----
MIIBCgKCAQEA...
-----END RSA PUBLIC KEY-----

-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEA...
-----END RSA PRIVATE KEY-----
```

**DER格式（二进制）：**
```
SEQUENCE
    INTEGER (n)
    INTEGER (e)  ; 公钥
    
或私钥:
SEQUENCE
    INTEGER (0)
    INTEGER (n)
    INTEGER (e)
    INTEGER (d)
    INTEGER (p)
    INTEGER (q)
    ...
```

## 判断依据

### 确认RSA实现的检查清单

- [ ] 存在1024-4096位大整数运算
- [ ] 模幂运算循环结构
- [ ] 公钥指数e为65537或3
- [ ] 存在标准加密库导入/函数调用
- [ ] 密钥数据符合PKCS#1或PKCS#8结构

### 与AES/对称加密区分

| 特征 | RSA | AES |
|-----|-----|-----|
| 密钥大小 | 1024+位 | 128/192/256位 |
| 核心运算 | 模幂 | 查表/S盒置换 |
| 数据结构 | 大整数 | 4x4状态矩阵 |
| 常量 | e=65537 | S-Box表 |

## 处理思路

### 一、密钥提取

**1. 内存中提取密钥：**
```python
# 从内存Dump中提取RSA密钥
import struct

def find_rsa_keys(dump_data):
    keys = []
    # 查找常见的e值模式
    e_values = [b'\x00\x01\x00\x01',  # 65537
                b'\x00\x00\x00\x03',  # 3
                b'\x00\x00\x00\x11']  # 17
    
    for e in e_values:
        offset = 0
        while True:
            pos = dump_data.find(e, offset)
            if pos == -1:
                break
            # 检查后面是否跟有大整数（n）
            n_candidate = dump_data[pos+4:pos+260]
            if is_valid_modulus(n_candidate):
                keys.append(('public', n_candidate, e))
            offset = pos + 1
    
    return keys
```

**2. 使用Frida提取：**
```javascript
// Hook RSA导入/生成函数
Interceptor.attach(Module.findExportByName(null, "CryptImportKey"), {
    onEnter: function(args) {
        console.log("CryptImportKey called");
        var pbData = args[1];
        var dwDataLen = args[2].toInt32();
        console.log(hexdump(pbData, {length: dwDataLen}));
    }
});

// Hook OpenSSL RSA_generate_key
Interceptor.attach(Module.findExportByName(null, "RSA_generate_key"), {
    onLeave: function(retval) {
        var rsa = retval;
        console.log("RSA key generated at:", rsa);
        // 读取n, e, d字段
    }
});
```

**3. 静态分析提取：**
```python
# Ghidra脚本提取常量密钥
def extract_embedded_keys():
    # 查找.data段中的大整数
    data = getDataBlock(".data")
    
    # 查找0x10001模式
    pattern = bytes.fromhex("00010001")
    offset = findBytes(data.getStart(), pattern)
    
    while offset:
        # 尝试解析密钥结构
        key = parse_rsa_key_at(offset)
        if key:
            print(f"Found key at {offset}: {key}")
        offset = findBytes(offset.add(1), pattern)
```

### 二、私钥恢复

**1. 从p和q恢复：**
```python
from Crypto.PublicKey import RSA
from Crypto.Util.number import inverse

def recover_private_key(p, q, e=65537):
    n = p * q
    phi = (p - 1) * (q - 1)
    d = inverse(e, phi)
    
    # CRT参数
    dP = d % (p - 1)
    dQ = d % (q - 1)
    qInv = inverse(q, p)
    
    key = RSA.construct((n, e, d, p, q))
    return key
```

**2. 从内存Dump恢复：**
```python
# 搜索私钥组件
def find_private_components(data):
    # 查找大整数模式
    # n通常在d之前
    # p和q通常在私钥结构中
    
    candidates = []
    for i in range(0, len(data) - 256, 8):
        # 尝试解析为RSA私钥结构
        key = try_parse_private_key(data[i:i+2048])
        if key:
            candidates.append((i, key))
    
    return candidates
```

### 三、常见攻击方法

**1. 小公钥指数攻击（e=3）：**
```python
# 当e=3且m^3 < n时，直接开立方
def small_e_attack(c, e=3):
    m = round(c ** (1.0/e))
    if pow(m, e, n) == c:
        return m
    return None
```

**2. 共模攻击：**
```python
from Crypto.Util.number import GCD, inverse

def common_modulus_attack(c1, c2, e1, e2, n):
    # gcd(e1, e2) = 1
    _, s, t = extended_gcd(e1, e2)
    
    if s < 0:
        c1 = inverse(c1, n)
        s = -s
    if t < 0:
        c2 = inverse(c2, n)
        t = -t
    
    m = (pow(c1, s, n) * pow(c2, t, n)) % n
    return m
```

**3. 因数分解攻击：**
```python
# Fermat因数分解（当p和q接近时）
def fermat_factor(n):
    a = isqrt(n)
    b2 = a*a - n
    while not is_square(b2):
        a += 1
        b2 = a*a - n
    b = isqrt(b2)
    return a - b, a + b

# Pollard's p-1算法
def pollards_p1(n, B=1000000):
    a = 2
    for j in range(2, B):
        a = pow(a, j, n)
        d = GCD(a - 1, n)
        if 1 < d < n:
            return d
    return None
```

**4. 私钥泄露攻击（Wiener攻击）：**
```python
# 当d < n^0.25时，可用连分数分解
def wiener_attack(e, n):
    # 计算e/n的连分数展开
    convergents = continued_fraction(e, n)
    
    for k, d in convergents:
        if k == 0:
            continue
        phi = (e * d - 1) // k
        # 求解x^2 - (n - phi + 1)x + n = 0
        p, q = solve_quadratic(1, -(n - phi + 1), n)
        if p * q == n:
            return d, p, q
    return None
```

### 四、验证逻辑逆向

**1. 注册码验证流程：**
```
输入: username, serial

1. 从username派生hash
2. 使用私钥签名hash -> expected_serial
3. 比较serial == expected_serial

逆向目标：提取公钥，自行计算合法serial
```

**2. 动态Patch验证：**
```python
# x64dbg脚本跳过RSA验证
# 定位比较指令
addr = find_instruction("cmp", after=rsa_verify_call)

# Patch为恒等比较
patch_bytes(addr, b'\x31\xC0\x90\x90')  # xor eax, eax; nop; nop
```

**3. 密钥替换：**
```python
# 用自己生成的密钥对替换原密钥
from Crypto.PublicKey import RSA

# 生成新密钥对
new_key = RSA.generate(2048)

# 提取公钥组件
n = new_key.n
e = new_key.e

# 在二进制中定位原公钥并替换
# 注意字节序和长度匹配
```

## 常见误区

- **误区1**：RSA加密数据长度等于密钥长度
  - ✅ 真实情况：实际加密数据长度小于密钥长度（填充）
  
- **误区2**：私钥总是包含p和q
  - ✅ 真实情况：可能只有(n, d)，CRT参数可选
  
- **误区3**：RSA很慢所以不会用于大量数据
  - ✅ 真实情况：通常混合使用（RSA传密钥，对称加密传数据）
  
- **误区4**：RSA签名就是私钥加密
  - ✅ 真实情况：PKCS#1 v1.5填充不同，PSS更复杂

## 失败信号与转向条件

- **密钥硬件存储**：考虑侧信道攻击或提取固件
- **远程验证**：分析协议，中间人攻击
- **自定义RSA实现**：识别核心运算，逆向算法
- **盲签名**：需要额外步骤提取密钥信息

## 工具与脚本

### RSA分析工具

| 工具 | 功能 | 安装 |
|-----|------|------|
| RSATool | 密钥生成、因数分解 | pip install rsatool |
| RsaCtfTool | CTF专用攻击集合 | GitHub |
| openssl | 密钥操作 | 系统自带 |
| pemcracker | PEM密码破解 | GitHub |

### 攻击脚本

**RsaCtfTool使用：**
```bash
# 自动尝试多种攻击
python RsaCtfTool.py --publickey key.pub --private

# 已知p和q恢复私钥
python RsaCtfTool.py -p 12345 -q 67890 -e 65537 --private

# 共模攻击
python RsaCtfTool.py --publickey key1.pub,key2.pub --uncipherfile cipher1,cipher2
```

**自定义验证绕过：**
```python
# 生成注册码
from Crypto.PublicKey import RSA
from Crypto.Signature import pkcs1_15
from Crypto.Hash import SHA256

def generate_serial(username, private_key):
    h = SHA256.new(username.encode())
    signature = pkcs1_15.new(private_key).sign(h)
    return signature.hex()

# 使用提取的私钥
key = RSA.import_key(open('extracted_key.pem').read())
serial = generate_serial("user123", key)
```

## 记录规范

- **样本 hash**：
- **RSA库**：OpenSSL/CryptoAPI/自定义
- **密钥长度**：
- **公钥指数e**：
- **是否提取私钥**：
- **攻击方法**：

## 参考案例

- CTF中RSA挑战（使用RsaCtfTool解决的题目）
- 软件注册码破解案例
- 固件中提取RSA密钥

## 相关专题

- [查表还原技术](./table-lookup-restoration.md) - 大数运算表识别
- [AES变种识别](./aes-variant-identification.md) - 对称加密对比
- [符号执行入门](./symbolic-execution.md) - 复杂验证逻辑分析

## 参考资源

- RSA算法详解: https://en.wikipedia.org/wiki/RSA_(cryptosystem)
- PKCS#1标准: https://tools.ietf.org/html/rfc8017
- RsaCtfTool: https://github.com/Ganapati/RsaCtfTool
- 大数分解算法: https://en.wikipedia.org/wiki/Integer_factorization

## 后续待补

- [ ] ECC算法识别
- [ ] DSA/ECDSA签名分析
- [ ] 后量子密码算法概述
