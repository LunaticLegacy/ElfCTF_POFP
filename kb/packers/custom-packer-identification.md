---
id: packers-custom-packer-identification
title: 自定义压缩壳识别与分析
category: packers
tags: [packers, ctf, custom, packer, identification, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 自定义压缩壳识别与分析

## 适用场景

- 识别非标准压缩壳
- 分析自定义解压算法
- 制定手动脱壳策略

## 识别信号

### 熵值分析

**原理：**
- 压缩/加密数据的熵值明显高于正常代码
- 正常代码熵值：约 5.5-6.5
- 压缩数据熵值：约 7.0-7.8
- 加密数据熵值：接近 8.0（理论最大值）

**Python 示例：**
```python
import math
from collections import Counter

def calculate_entropy(data):
    """计算数据块的熵值"""
    if not data:
        return 0
    
    counter = Counter(data)
    length = len(data)
    entropy = 0.0
    
    for count in counter.values():
        p = count / length
        if p > 0:
            entropy -= p * math.log2(p)
    
    return entropy

# 分析 PE 节区
for section in pe.sections:
    entropy = calculate_entropy(section.get_data())
    print(f"{section.Name}: {entropy:.2f}")
    if entropy > 7.0:
        print("  → 可能经过压缩或加密")
```

### 文件签名分析

**标准压缩格式签名：**
| 格式 | Magic Bytes | 说明 |
|-----|------------|------|
| ZIP | `50 4B 03 04` | 标准 ZIP |
| GZIP | `1F 8B` | GZIP 压缩 |
| LZMA | `FD 37 7A 58 5A 00` | LZMA/XZ |
| ZLIB | `78 9C` / `78 DA` | ZLIB Deflate |

**自定义壳特征：**
- 无标准 Magic Bytes
- 头部可能是自定义结构或加密数据
- 节区名非标准（非 .text/.data/.rsrc）
- 入口点指向非标准位置

## 判断依据

### Stub 结构识别

**典型壳加载流程：**
```
1. 保存入口参数（寄存器、栈状态）
2. 获取壳所需 API 地址（可能通过 PEB 遍历或哈希查找）
3. 分配内存用于解压
4. 解密/解压原始代码和数据
5. 修复 IAT（导入地址表）
6. 处理重定位项
7. Hook API（如有需要）
8. 跳转到原始入口点（OEP）
```

### API 获取方式识别

**常见 API 获取模式：**
```asm
; 方式1：直接通过 PEB 遍历
mov eax, fs:[0x30]      ; PEB
mov eax, [eax+0x0C]     ; PEB_LDR_DATA
mov eax, [eax+0x14]     ; InMemoryOrderModuleList

; 方式2：哈希查找
mov esi, module_base
loop_api:
    mov eax, [esi+export_table]
    ; 计算函数名哈希
    cmp eax, target_hash
    je found_api

; 方式3：字符串比较
mov esi, api_name_string
call strcmp
```

### 自定义算法识别

**LZ 系列算法特征：**
```c
// LZ77 解压伪代码
while (input < input_end) {
    flags = *input++;
    for (i = 0; i < 8; i++) {
        if (flags & 1) {
            // 长度-距离对
            match_len = (*input & 0x0F) + 3;
            match_dist = ((*input >> 4) << 8) | *(input+1);
            input += 2;
            copy_from_window(match_dist, match_len);
        } else {
            // 直接字节
            *output++ = *input++;
        }
        flags >>= 1;
    }
}
```

**识别要点：**
- 滑动窗口大小（4KB/32KB/64KB）
- 长度/距离编码位数
- 标志位处理顺序（高位/低位优先）

## 处理思路

### 动态分析流程

```
步骤1：定位解压函数
   └─ 在 VirtualAlloc/HeapAlloc 下断点
   └─ 跟踪写入的大块内存

步骤2：分析解压循环
   └─ 单步跟踪识别算法类型
   └─ 记录输入输出关系

步骤3：Dump 解压数据
   └─ 在解压完成时下断点
   └─ Dump 原始代码和数据

步骤4：验证 OEP
   └─ 检查 dumped 数据的入口点
   └─ 确认 PE 结构完整性
```

### 定位 OEP 的方法

| 方法 | 描述 | 适用场景 |
|-----|------|---------|
| 跨段指令 | 寻找跨节区的跳转指令 | 简单壳 |
| 内存访问断点 | 在原始代码段下写入断点 | 通用方法 |
| 栈平衡法 | 跟踪栈指针变化 | ESP 定律 |
| 尾部跳转 | 寻找解压后的 JMP/CALL | 常见模式 |
| 熵值变化监测 | 监测内存区域熵值下降 | 自动化分析 |

## 常见误区

| 误区 | 正确认识 |
|-----|---------|
| "无签名就是无壳" | 可能是新型或自定义壳 |
| "熵值高就是加密" | 压缩数据同样具有高熵值 |
| "自定义壳一定难脱" | 取决于实现复杂度，有些比商业壳更简单 |
| "Dump 后就能直接分析" | 可能需要手动修复 IAT 和重定位 |
| "所有壳都有明显特征" | 高级自定义壳会伪装成正常程序 |

## 识别决策树

```
开始分析 PE
    │
    ▼
是否有标准节区名？
    │
    ├── 是 → 可能是标准壳或伪装壳
    │
    └── 否 → 检查节区熵值
              │
              ├── 高熵值(>7.0) → 确认压缩/加密
              │
              └── 检查入口点代码
                        │
                        ├── 标准编译器模式 → 可能未加壳
                        │
                        └── 异常/混淆代码 → 可能是自定义壳

进一步确认：
1. 检查 TLS 回调
2. 检查异常处理表
3. 检查资源节内容
4. 动态跟踪启动流程
```

## 自定义壳 vs 标准壳对比

| 特征 | 标准壳（UPX/ASPack） | 自定义壳 |
|-----|---------------------|---------|
| 节区名 | 标准或可识别 | 随机或无意义 |
| 签名 | 可被 PEiD/ExeInfo 识别 | 无匹配签名 |
| 解压算法 | 标准（LZMA/NRV等） | 自定义或魔改 |
| Stub 代码 | 固定模板 | 多变且混淆 |
| API 获取 | 标准方式 | 自定义哈希或加密 |
| 反调试 | 基础或没有 | 可能集成复杂机制 |

## 相关工具

| 工具 | 用途 |
|-----|------|
| **PE-bear** | PE 结构分析，节区熵值查看 |
| **CFF Explorer** | PE 编辑和节区分析 |
| **Detect It Easy** | 壳识别和熵值分析 |
| **ExeInfo PE** | 快速壳识别 |
| **binwalk** | 固件/嵌入文件提取 |
| **HxD / 010 Editor** | 十六进制分析 |
| **x64dbg/OllyDbg** | 动态调试 |
| **IDA Pro/Ghidra** | 静态反汇编分析 |

## 参考案例

- [L00K_at_h3r3 脱壳案例笔记](../case-studies/reviewed/l00k-at-h3r3-unpack-notes.md)

## 参考资源

- 《加密与解密（第4版）》
- 看雪论坛脱壳分析文章
