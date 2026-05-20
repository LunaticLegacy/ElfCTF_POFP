---
id: case-studies-reviewed-peek-stack-case-study
title: peek_stack MSVC 字符串分析案例
category: case-studies
tags: [case-studies, ctf, peek, stack, case, study, msvc]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# peek_stack MSVC 字符串分析案例

## 来源

- **题目名称**：peek_stack
- **原始目录**：`prompts/reverse/peek_stack/`
- **原始 writeup**：`prompts/reverse/peek_stack/writeup.md`
- **Knowledge Card**：`prompts/reverse/peek_stack/knowledge_card.json`

## 结论摘要

本案例展示了如何逆向分析 MSVC 编译的 C++ 程序，重点在于识别 `std::string` 的内存布局和理解 UTF-8 编码字符串的处理方式。程序使用简单的 XOR 0x5a 加密，关键在于发现内置口令"秘密口令 2025"的 UTF-8 字节序列，并通过异或运算还原 flag。

**难度等级**：Easy  
**知识点标签**：MSVC STL、std::string 布局、UTF-8 编码、XOR 加密、PE32 基础

## 关键证据

1. **内存中的 UTF-8 字符串**：在地址 `0x00401000` 附近发现 16 字节序列 `e7 a7 98 e5 af 86 e5 8f a3 e4 bb a4 32 30 32 35`，对应"秘密口令 2025"的 UTF-8 编码。

2. **比较逻辑位置**：在 `main` 函数地址 `0x004015de` 附近发现用户输入与内置口令的比较操作。

3. **解密函数特征**：函数 `fcn.00401220` 中包含典型的 XOR 循环模式：
   ```assembly
   movzx eax, byte [input]
   xor eax, 0x5a
   mov [output], al
   ```

4. **输出格式**：使用 `std::hex` 和 `setw(2)` 以十六进制格式输出每个字节。

## 可复用知识点

### 1. MSVC std::string 内存布局识别

**小字符串优化 (SSO)**：
- 长度 ≤ 15 字符：数据直接存储在对象内部
- 长度 > 15 字符：存储指向堆内存的指针

**本案例中的表现**：
```cpp
// std::string 对象在内存中的结构（32 位）
struct StdString {
    union {
        char buffer[16];  // SSO 缓冲区
        char* ptr;        // 长字符串指针
    };
    size_t length;
    size_t capacity;
};
```

**识别技巧**：
- 查看是否使用了 `_String_alloc` 相关函数
- 观察是否有 `memcpy` 操作（短字符串）
- 注意指针解引用模式（长字符串）

### 2. UTF-8 编码识别

**判断依据**：
- 非 ASCII 字符（> 0x7F）
- 多字节序列符合 UTF-8 编码规则
- 常见中文 UTF-8 前缀：`E4`, `E5`, `E6`

**本案例验证**：
```python
# "秘密口令 2025" 的 UTF-8 字节
secret = "秘密口令 2025"
utf8_bytes = secret.encode('utf-8')
# b'\xe7\xa7\x98\xe5\xaf\x86\xe5\x8f\xa3\xe4\xbb\xa42025'
```

### 3. XOR 加密模式识别

**汇编特征**：
```assembly
xor eax, 0x5a  ; 异或常量
and eax, 0xFF  ; 保留低 8 位
```

**Python 复现**：
```python
def xor_decrypt(data, key):
    return bytes([b ^ key for b in data])

# 本案例
encrypted = bytes.fromhex('e7a798e5af86e58fa3e4bba432303235')
decrypted = xor_decrypt(encrypted, 0x5a)
print(decrypted.hex())  # bdfdc2bff5dcbfd5f9bee1fe686a686f
```

### 4. radare2 分析技巧

**关键命令**：
```bash
r2 -A peek_stack.exe     # 自动分析
pdf @ sym.main           # 打印 main 函数
psz @ 0x00401000         # 打印字符串
px @ 0x00401000          # 打印十六进制
```

**查找字符串引用**：
```bash
/rz flag{               # 搜索字符串引用
/xc e7a798e5            # 搜索字节序列
axt @ 0x00401000        # 查找交叉引用
```

## 误判与返工

### 初始误判
1. **误认为是 ANSI 编码**：最初假设字符串是 GBK 或 ANSI 编码，导致无法正确还原。
   
2. **忽略 SSO 优化**：试图寻找堆内存分配，实际上短字符串直接存储在栈上。

3. **XOR 密钥猜测错误**：尝试了常见的 0x41、0x42 等，最终通过动态调试才发现是 0x5a。

### 纠正过程
1. **编码识别**：通过观察字节序列 `E7 A7 ...` 的高位特征，确认是 UTF-8 编码。

2. **动态验证**：使用 wine + 调试器，在输出前查看内存，确认 XOR 后的结果。

3. **脚本验证**：编写 Python 脚本批量测试可能的 XOR 密钥，快速定位 0x5a。

## 应沉淀到的专题页

建议阅读顺序：
1. [MSVC STL 字符串布局](../../reversing/msvc-string-layout.md) - 理解 C++ 字符串内部结构
2. [UTF-8 编码识别](../../reversing/utf8-encoding-detection.md) - 多字节字符集基础知识
3. [XOR 加密模式](../../reversing/xor-encryption-patterns.md) - 简单加密技术识别
4. [PE32 基础逆向](../../workflows/windows-pe-triage.md) - Windows 程序分析入门

## 待补脚本或自动化点

### 已有脚本
位置：`prompts/reverse/peek_stack/`
```bash
# 求解命令（记录在 knowledge_card.json）
python3 -c "data = bytes.fromhex('e7a798e5af86e58fa3e4bba432303235'); print(''.join([format(b ^ 0x5a, '02x') for b in data]))"
```

### 可自动化点
1. **UTF-8 字符串自动检测**：
   ```python
   def detect_utf8(bytes_seq):
       try:
           return bytes_seq.decode('utf-8')
       except:
           return None
   ```

2. **XOR 密钥暴力破解**：
   ```python
   for key in range(256):
       result = xor_decrypt(data, key)
       if is_printable(result):
           print(f"Key {hex(key)}: {result}")
   ```

3. **radare2 自动化脚本**：
   ```python
   # r2pipe 脚本示例
   import r2pipe
   r2 = r2pipe.open("peek_stack.exe")
   r2.cmd("aaa")
   strings = r2.cmd("izzj")  # JSON 格式导出字符串
   ```

### 未来改进方向
- 开发 IDAPython 脚本自动识别 std::string 模式
- 建立常见 UTF-8 中文字符的特征库
- 集成 XOR 爆破工具到标准分析流程

## 解题时间线

| 阶段 | 用时 | 主要活动 |
|------|------|----------|
| 文件识别 | 5 min | file 命令、PE 头检查 |
| 静态分析 | 30 min | radare2 字符串搜索、main 函数分析 |
| 动态验证 | 20 min | wine 运行、调试器跟踪 |
| 脚本求解 | 10 min | Python 脚本编写与执行 |
| 验证提交 | 5 min | 最终验证 |
| **总计** | **70 min** | - |

## 核心 Flag

```
flag{bdfdc2bff5dcbfd5f9bee1fe686a686f}
```

验证方法：
```bash
echo -e "\xe7\xa7\x98\xe5\xaf\x86\xe5\x8f\xa3\xe4\xbb\xa4\x32\x30\x32\x35" | wine peek_stack.exe
# 输出：flag{bdfdc2bff5dcbfd5f9bee1fe686a686f}
```
