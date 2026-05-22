---
id: reversing-table-lookup-restoration
title: 查表还原技术
category: reversing
tags: [reversing, ctf, table, lookup, restoration, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 查表还原技术

## 适用场景

- 识别密码学算法中的 S-Box
- 分析自定义替换表
- 从二进制中提取查找表

## 识别信号

### S-Box（替换盒）基础概念

S-Box 是对称加密算法中的核心非线性组件，负责执行字节替换操作。其本质是预计算的查找表。

**AES S-Box 特性：**
- 大小：256字节（16×16矩阵）
- 数学基础：GF(2⁸)上的乘法逆元 + 仿射变换
- 可逆性：AES S-Box 是可逆的，通过逆S-Box（Inv-S-Box）可还原
- 优化实现：使用 T-Table（T盒）技术，将 SubBytes、ShiftRows 和 MixColumns 融合为查表操作

**DES S-Box 特性：**
- 8个不同的 S-Box，每个将6位输入映射为4位输出
- 外2位作为行索引，内4位作为列索引
- 不可逆：DES 是 Feistel 网络，加密解密使用相同结构

**Blowfish S-Box 特性：**
- 4个 S-Box，每个包含256个32位条目
- 18个32位子密钥组成的 P-Array
- S-Box 在密钥扩展阶段动态生成，与密钥相关

### AES T-Table 实现

```c
// T-Table 生成逻辑
T1[i] = {S[i]*2, S[i], S[i], S[i]*3}
T2[i] = {S[i]*3, S[i]*2, S[i], S[i]}
T3[i] = {S[i], S[i]*3, S[i]*2, S[i]}
T4[i] = {S[i], S[i], S[i]*3, S[i]*2}
// 每轮只需16次查表 + 12次32位XOR
```

## 判断依据

### 二进制层面的识别标志

| 特征类型 | 具体标志 |
|---------|---------|
| 常量模式 | 0x63,0x7c,0x77,0x7b...（AES S-Box前4字节） |
| 表大小 | 256字节（标准S-Box）、1KB（32位T-Table）、4KB（完整T表集） |
| 代码模式 | 连续的查表指令（如 `movzx eax, byte ptr [ebx+table]`） |
| 密钥扩展 | rcon 常量表（0x01, 0x02, 0x04, 0x08...） |
| 置换表 | 特定排列模式（如AES行移位的固定排列） |

### 静态分析特征

**AES 识别：**
- 搜索 T-Table 的前几个DWORD值（如 `0xc66363a5`）
- 检测 4个或8个连续的1KB表
- 密钥扩展中的循环结构（10/12/14轮）
- `static const` 声明的常量数组

**DES 识别：**
- 8个64字节的小表（共512字节）
- 置换表（IP、FP、PC1、PC2等）
- 特定的移位计数表

**Blowfish 识别：**
- 4个1024字节的S-Box表（共4096字节）
- 72字节的P-Array
- Feistel 网络结构（16轮）

### 动态分析特征

- 内存访问模式的规律性（256字节对齐访问）
- 指令级别的查表热点
- 调试API监控到的表访问序列

## 处理思路

### 静态提取流程

```
步骤1: 字符串扫描
  → 搜索 "AES"、"S-Box"、"rijndael" 等关键词
  
步骤2: 常量匹配
  → 对比已知加密常量数据库
  → 检测 S-Box、rcon、置换表等
  
步骤3: 交叉引用分析
  → 追踪常量表的引用位置
  → 识别加密/解密函数边界
  
步骤4: 数据流分析
  → 追踪密钥材料来源
  → 识别轮函数结构
```

### 动态提取流程

```
步骤1: 内存扫描
  → 在进程内存中搜索已知表签名
  
步骤2: 访问监控
  → 使用调试API监控表访问
  → 记录访问顺序和模式
  
步骤3: 密钥推导
  → 从访问模式推导轮密钥
  → 识别加密模式（ECB/CBC/CTR等）
  
步骤4: 数据提取
  → 从内存转储中提取密钥和密文
```

### 自定义替换表分析

对于非标准加密或混淆使用的自定义表：

1. **表结构分析**
   - 确定表大小（256字节、512字节、1KB等）
   - 分析输入输出位宽（如8→8、8→32等）
   - 识别索引计算方式

2. **语义恢复**
   - 通过输入输出对分析变换规律
   - 检测是否为线性变换
   - 尝试还原数学公式

3. **逆向构造**
   - 如果是置换表，构建逆置换表
   - 如果是替换表，构建逆查找表

## 常见误区

| 陷阱 | 说明 | 应对策略 |
|-----|------|---------|
| **魔改头部** | 标准表但做了字节级异或 | 分析异或模式，批量还原 |
| **分片存储** | 表被拆分成多个小数组 | 通过交叉引用合并 |
| **运行时生成** | S-Box在初始化时计算 | 断点拦截，内存转储 |
| **白盒混淆** | 表被编码混淆 | 需要逆向编码层 |
| **假表干扰** | 插入伪造的常量数据 | 交叉引用验证真实性 |
| **压缩存储** | 表使用LZ等压缩 | 先解压再分析 |

## 相关工具

| 工具名称 | 用途 | 适用平台 |
|---------|------|---------|
| **IDA Pro** | 静态分析、反汇编、表识别 | Windows/Linux/macOS |
| **Ghidra** | 反编译、常量分析、脚本自动化 | 跨平台 |
| **Cutter** | 轻量级反汇编、十六进制分析 | 跨平台 |
| **Detect It Easy** | 加密签名检测 | 跨平台 |
| **Signsrch** | 已知常量搜索 | IDA/Ghidra插件 |
| **x64dbg** | 动态调试、内存监控 | Windows |
| **Frida** | 运行时插桩、表访问追踪 | 跨平台 |

## 实战技巧

### 快速AES识别

```python
# 搜索AES T-Table特征签名
aes_t_table_signatures = [
    b'\xa5\x63\x63\xc6',  # T1[0] little-endian
    # 其他特征字节...
]

def find_aes_tables(binary_data):
    matches = []
    for sig in aes_t_table_signatures:
        pos = binary_data.find(sig)
        if pos != -1:
            matches.append(pos)
    return matches
```

### 内存中提取密钥

```python
# 通过调试API监控AES表访问提取密钥
def monitor_aes_access(process_handle, sbox_addr):
    # 设置内存访问断点
    # 记录每次访问的索引
    # 根据访问顺序推导轮密钥
    pass
```

### 魔改S-Box识别

当遇到修改过的S-Box时：
1. 检测表大小仍为256字节
2. 检查是否保持双射（bijective）特性
3. 通过代数分析尝试还原修改方式

## 参考案例

- `prompts/reverse/Project1/`（自定义 AES S-Box 和 Rcon 表）

## 参考资源

- CTF Crypto Wiki
- 密码学算法标准文档
