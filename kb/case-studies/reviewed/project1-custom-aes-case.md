---
id: case-studies-reviewed-project1-custom-aes-case
title: Project1 自定义 AES 加密案例
category: case-studies
tags: [case-studies, ctf, project1, custom, aes, case]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Project1 自定义 AES 加密案例

## 来源

- **题目名称**：Project1
- **原始目录**：`prompts/reverse/Project1/`
- **原始 writeup**：`prompts/reverse/Project1/writeup.md`
- **关键脚本**：
  - `analyze_logic.py` - 逻辑分析
  - `dump_cipher.py` - 密码表 dump
  - `dump_tables.py` - S-Box/Rcon 提取
  - `dump_main.py` - 主程序分析
  - `recon.py` - 重构算法
  - `solve.py` - 最终求解
  - `verify_flag.py` - Flag 验证

## 结论摘要

本案例深入分析了使用自定义 AES 变种的 CTF 挑战。程序实现了非标准的 AES 加密：自定义 S-Box 和 Rcon 表、修改的 ShiftRows（XOR 0x66）、CBC 工作模式。通过从 PE 文件数据段 dump 出加密表和密钥，成功复现解密算法并还原 flag。这是中级加密算法逆向的典型案例。

**难度等级**：Medium-Hard  
**知识点标签**：AES 变种、S-Box 提取、CBC 模式、PE 数据段 dump、查表法加密

## 关键证据

### 1. 自定义 S-Box 定位
**位置**：`0x403158`  
**大小**：256 字节  
**提取方式**：
```python
# dump_tables.py
with open("pefile", "rb") as f:
    f.seek(0x403158)
    sbox = f.read(256)
```

**特征**：与标准 AES S-Box 不同，需要手动生成逆 S-Box 用于解密。

### 2. 自定义 Rcon 表
**位置**：`0x403258`  
**内容**：`07 09 12 04 08 10 21 40 88 1b 36 ...`  
**用途**：密钥扩展中的轮常量，与标准 AES 的 `01 02 04 08 ...` 不同。

### 3. 修改的 ShiftRows
**汇编代码位置**：`0x4016F0` 附近  
**关键指令**：
```assembly
xor byte [state + 7], 0x66  ; 对状态矩阵第 8 字节 XOR 0x66
```

**影响**：
- 正向：`state[3][0] ^= 0x66`（在 ShiftRows 之后）
- 逆向：`InvShiftRows 后 state[3][0] ^= 0x66`

### 4. AES 密钥和 IV
**AES 密钥**：`012202f344f5e6f7a8b90a0baccdeeff` (16 字节)  
**Key1 (IV)**：`3af18c27d49b60e2115da7c37f09b84e` (16 字节)  
**密文块**：
- C1: `2b1bc999bebde68530c90910263cf326`
- C2: `62e7d0ede09f07cf3e7e21bdf729119e`

### 5. CBC 模式识别
**判断依据**：
- 两个 16 字节密文块
- Block 2 解密前需 XOR Block 1 的密文
- 存在独立的 IV (Key1)

## 可复用知识点

### 1. AES 算法变种识别

**标准 AES 特征**：
```python
# 标准 AES S-Box 前几个字节
SBOX_STANDARD = [0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, ...]
```

**本案例的差异**：
```python
# 自定义 S-Box（第一个字节不同）
SBOX_CUSTOM = [0x63, 0x1e, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, ...]
#                    ^^^^ 差异点
```

**识别流程**：
1. 查找 256 字节的查找表（通常在数据段）
2. 对比标准 S-Box
3. 如果不匹配 → 自定义 AES
4. 同时寻找 Rcon 表（通常紧随 S-Box）

### 2. PE 文件数据段 Dump

**方法一：静态读取**
```python
def dump_from_pe(pe_path, offset, size):
    with open(pe_path, "rb") as f:
        f.seek(offset)
        return f.read(size)

sbox = dump_from_pe("Project1.exe", 0x403158, 256)
```

**方法二：使用 pefile 库**
```python
import pefile

pe = pefile.PE("Project1.exe")
for section in pe.sections:
    print(f"{section.Name}: {hex(section.VirtualAddress)}")
    
# 找到 .data 节后计算偏移
```

**方法三：调试器内存 dump**
```bash
# x64dbg 命令
savedata "sbox.bin", 0x403158, 0x100
```

### 3. ShiftRows 变种分析

**标准 ShiftRows**：
```python
def shift_rows(state):
    state[1] = state[1][1:] + state[1][:1]  # Row 1 左移 1
    state[2] = state[2][2:] + state[2][:2]  # Row 2 左移 2
    state[3] = state[3][3:] + state[3][:3]  # Row 3 左移 3
```

**本案例的修改**：
```python
def modified_shift_rows(state):
    shift_rows(state)
    state[3][0] ^= 0x66  # 额外 XOR 操作
```

**逆向时的处理**：
```python
def inv_shift_rows_modified(state):
    inv_shift_rows(state)  # 先做标准逆变换
    state[3][0] ^= 0x66    # 再撤销 XOR
```

### 4. CBC 模式解密

**加密流程**：
```
P1 → XOR(IV) → AES_Encrypt → C1
P2 → XOR(C1) → AES_Encrypt → C2
```

**解密流程**：
```python
# Block 1
P1_encrypted = AES_Decrypt(C1)
P1 = XOR(P1_encrypted, IV)

# Block 2
P2_encrypted = AES_Decrypt(C2)
P2 = XOR(P2_encrypted, C1)
```

**Python 实现**：
```python
from Crypto.Cipher import AES

# 如果使用标准 AES（本例需要自定义）
cipher = AES.new(key, AES.MODE_CBC, iv)
plaintext = cipher.decrypt(ciphertext)
```

### 5. 密钥调度分析

**标准 AES 密钥扩展**：
```python
def key_expansion(key):
    nk = len(key) // 4  # 4 (128-bit)
    w = []
    
    # 初始密钥
    for i in range(nk):
        w.append(key[i*4:(i+1)*4])
    
    # 扩展
    for i in range(nk, 4 * 11):  # 10 rounds
        temp = w[i-1]
        if i % nk == 0:
            temp = sub_word(rot_word(temp))
            temp = xor(temp, rcon[i // nk])
        w.append(xor(w[i-nk], temp))
    
    return w
```

**本案例的差异**：
- 使用自定义 S-Box 进行 SubWord
- 使用自定义 Rcon 表

### 6. Z3 求解器应用（备选方案）

如果无法直接提取密钥，可以使用约束求解：

```python
from z3 import *

s = Solver()
flag_chars = [BitVec(f'flag_{i}', 8) for i in range(32)]

# 添加约束
for i, c in enumerate(flag_chars):
    s.add(c >= 0x20, c <= 0x7e)  # 可打印字符

# 添加加密逻辑约束
# ... 复杂的 AES 约束建模 ...

if s.check() == sat:
    m = s.model()
    print(''.join([chr(m[c].as_long()) for c in flag_chars]))
```

## 误判与返工

### 初始误判
1. **误认为是标准 AES**：
   - 尝试使用 pycryptodome 直接解密失败
   - 发现 S-Box 与标准不匹配后才确认是自定义版本

2. **忽略 ShiftRows 修改**：
   - 最初解密结果有乱码
   - 通过调试器发现 `XOR 0x66` 指令
   - 修正 InvShiftRows 逻辑

3. **Rcon 索引错误**：
   - 密钥扩展时 Rcon 索引起始值搞错
   - 应该是 `Rcon[1]` 对应第一轮，而非 `Rcon[0]`
   - 通过对比汇编中的访问模式纠正

### 纠正过程
1. **S-Box 验证**：
   ```python
   # 生成逆 S-Box 并验证
   InvSbox = [0] * 256
   for i in range(256):
       InvSbox[Sbox[i]] = i
   
   # 测试：Sbox[InvSbox[x]] == x
   assert all(Sbox[InvSbox[i]] == i for i in range(256))
   ```

2. **分步调试**：
   ```python
   # 逐轮输出中间状态
   state = ciphertext
   for round in range(9, 0, -1):
       inv_shift_rows(state)
       print(f"Round {round} after ISR: {state.hex()}")
       inv_sub_bytes(state)
       add_round_key(state, round)
       print(f"Round {round} after ISB: {state.hex()}")
   ```

3. **对比验证**：
   - 用已知明文测试加密函数
   - 对比程序输出和脚本输出
   - 确保每个步骤一致

## 应沉淀到的专题页

建议阅读顺序：
1. [查表还原技术](../../reversing/table-lookup-restoration.md) - S-Box/置换表提取基础
2. [AES 算法变种识别](../../reversing/aes-variant-identification.md) - 非标准 AES 分析
3. [PE 数据段提取](../../reversing/pe-data-extraction.md) - 从 PE 文件 dump 数据
4. [CBC 模式分析](../../reversing/cbc-mode-analysis.md) - 分组密码工作模式
5. [密钥调度逆向](../../reversing/key-schedule-reversal.md) - AES 密钥扩展分析

## 待补脚本或自动化点

### 已有脚本汇总

**1. dump_tables.py** - 提取 S-Box 和 Rcon
```python
import pefile

pe = pefile.PE("Project1.exe")
# 定位并导出 S-Box (0x403158, 256 bytes)
# 定位并导出 Rcon (0x403258, ? bytes)
```

**2. analyze_logic.py** - 分析加密流程
```python
# 反汇编关键函数
# 识别 AES 特征指令
```

**3. solve.py** - 完整求解脚本
```python
# 包含完整的 AES 解密实现
# 自定义 S-Box、Rcon、ShiftRows 修改
```

**4. verify_flag.py** - 验证结果
```python
# 重新加密解密后的 flag
# 对比原始密文
```

### 可自动化点

1. **AES 特征自动识别 IDAPython 脚本**：
```python
def identify_aes_variant():
    patterns = {
        'sbox_load': ['movzx', 'mov al', 'byte ptr'],
        'mixcolumns': ['imul', '0x1b'],  # GF(2^8) reduction
        'shiftrows': ['xor', '0x66']     # 自定义修改
    }
    # 扫描二进制文件寻找模式
```

2. **PE 数据段自动提取工具**：
```python
def extract_data_sections(pe_path):
    sections = {}
    pe = pefile.PE(pe_path)
    for section in pe.sections:
        name = section.Name.decode().strip('\x00')
        sections[name] = {
            'va': section.VirtualAddress,
            'size': section.SizeOfRawData,
            'data': section.get_data()
        }
    return sections
```

3. **S-Box 类型分类器**：
```python
def classify_sbox(sbox_bytes):
    # 对比已知 S-Box 数据库
    known_sboxes = {
        'aes': AES_SBOX,
        'des': DES_SBOX,
        'serpent': SERPENT_SBOX,
        # ...
    }
    
    matches = {}
    for name, ref in known_sboxes.items():
        similarity = sum(a == b for a, b in zip(sbox_bytes, ref)) / 256
        matches[name] = similarity
    
    return max(matches, key=matches.get)
```

### 未来改进方向
- 开发通用 AES 变种分析框架
- 建立常见加密算法 S-Box 数据库
- 集成自动化工具到 Ghidra/IDA
- 研究更多 ShiftRows 变种模式

## 解题时间线

| 阶段 | 用时 | 主要活动 |
|------|------|----------|
| 文件识别 | 10 min | PE 分析、节区检查 |
| 静态分析 | 60 min | IDA/radare2 逆向、S-Box 定位 |
| 数据提取 | 20 min | dump_tables.py 编写与执行 |
| 算法复现 | 90 min | solve.py 编写、调试 |
| 验证优化 | 30 min | verify_flag.py、对比测试 |
| 文档整理 | 30 min | writeup 编写 |
| **总计** | **240 min (4 小时)** | - |

## 核心 Flag

```
POFPCTF{3c55d6342a6b15f13b55747}
```

验证脚本：
```bash
python3 verify_flag.py
# 输出：Flag verified!
```

## 相关资源

- [AES Specification (NIST FIPS 197)](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.197.pdf)
- [pycryptodome 文档](https://www.pycryptodome.org/en/latest/src/cipher/aes.html)
- [Z3 求解器教程](https://github.com/Z3Prover/z3/wiki)
- [CTF Crypto Wiki - AES](https://github.com/Jean-Baptiste-Lemaire/CTF-Crypto-Wiki#aes)
