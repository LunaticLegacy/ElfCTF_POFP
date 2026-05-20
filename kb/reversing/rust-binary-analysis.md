---
id: reversing-rust-binary-analysis
title: Rust二进制分析
category: reversing
tags: [reversing, ctf, rust, binary, analysis, authorized-analysis, malware-research]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# Rust二进制分析

## 摘要

Rust语言编写的二进制文件在CTF和恶意软件中日益增多（如BlackCat勒索软件、Luca Stealer）。本文介绍Rust二进制识别方法、内存布局分析和常见模式逆向技巧。

## 适用场景

- **保护类型**：无保护或轻微混淆的Rust二进制
- **文件类型**：ELF、PE、Mach-O
- **分析目标**：识别Rust特征、还原逻辑、提取字符串
- **不适用条件**：重度混淆、自定义运行时修改

## 识别信号

### 1. 编译器标识

**ELF文件：**
```bash
$ readelf -p .comment target

String dump of section '.comment':
  [     0]  rustc version 1.75.0
```

**PE文件：**
- 检查`.rdata`或`.data`中的版本字符串
- 常见：`rustc`, `cargo`, `rust-version`

**符号表特征：**
```
_ZN4rust5alloc5alloc...    # Rust allocator函数
_ZN4core4ptr...            # core::ptr函数
_ZN3std2io...              # std::io函数
```

### 2. 运行时特征

**Panic处理：**
```asm
; Rust panic调用特征
call std::panicking::rust_panic
call std::panicking::begin_panic
call core::panicking::panic
```

**切片边界检查：**
```asm
; 数组/切片访问检查
call core::panicking::panic_bounds_check
; 或内联检查
mov rax, [len]
cmp rcx, rax
jae panic_handler
```

**Result/Option处理：**
```asm
; 常见的unwrap模式
mov rax, [result]
test rax, rax
jz unwrap_failed
call core::result::unwrap_failed
```

### 3. 标准库特征

**格式化宏（format!/println!）：**
```asm
; 格式化字符串处理
call std::fmt::format
call core::fmt::write
call std::io::stdio::_print
```

**字符串处理：**
```asm
; String/Vec操作
call alloc::string::String::push
call alloc::vec::Vec::push
call alloc::vec::Vec::grow
```

### 4. 内存分配器

**System Allocator：**
```asm
; 标准分配/释放
call __rust_alloc
call __rust_dealloc
call __rust_realloc
```

**jemalloc（旧版本）：**
```asm
; 可能链接je_malloc/je_free
call je_mallocx
call je_free
```

## 判断依据

### 确认Rust编译的检查清单

- [ ] `.comment`段包含`rustc`版本信息
- [ ] 符号表包含`std::`、`core::`、`alloc::`命名空间
- [ ] 存在`rust_panic`或`panic_bounds_check`相关函数
- [ ] 使用`__rust_alloc`系列分配函数
- [ ] 字符串字面量以UTF-8编码存储

### 与Go的区分

| 特征 | Rust | Go |
|-----|------|-----|
| 字符串 | UTF-8，可能包含BOM | Go字符串(长度+数据) |
| 运行时 | 较小，非抢占式 | 较大，Goroutine调度 |
| 错误处理 | Result/Option | 多返回值 |
| 符号 | Rust mangling | Go特有格式 |

## 处理思路

### 一、字符串提取

**1. 识别字符串切片（&str）：**
```rust
// Rust字符串切片内存布局
struct &str {
    data: *const u8,    // 指向UTF-8数据
    len: usize          // 长度
}
```

**2. 提取工具：**
```bash
# 使用strings提取UTF-8字符串
strings -e l target  # little-endian UTF-16
strings -e b target  # big-endian UTF-16
strings target | grep -P '[\x20-\x7e]{4,}'  # ASCII可打印

# 使用rust-specific工具
ruststrings target  # 识别Rust字符串结构
```

**3. Ghidra脚本提取：**
```python
# rust_string_extractor.py
# 提取Rust字符串切片引用

def find_rust_strings():
    strings = []
    # 查找ptr+len模式
    for ref in currentProgram.getReferenceManager().getReferenceIterator():
        if ref.getReferenceType().isData():
            addr = ref.getFromAddress()
            # 检查是否为ptr+len结构
            ptr = getLong(addr)
            len_val = getLong(addr.add(8))
            if is_valid_ptr(ptr) and len_val < 10000:
                str_data = get_bytes(ptr, len_val)
                strings.append((addr, str_data.decode('utf-8', errors='ignore')))
    return strings
```

### 二、识别核心数据结构

**1. Option<T>：**
```rust
// 内存布局
tag: u8 (0=None, 1=Some)
data: T

// 或对于非空指针优化
// Some(T) = T的地址
// None = 0 (null)
```

**2. Result<T, E>：**
```rust
// 内存布局
tag: u8 (0=Ok, 1=Err)
data: union { Ok: T, Err: E }
```

**3. Vec<T>：**
```rust
struct Vec<T> {
    buf: *mut T,      // 堆缓冲区指针
    len: usize,       // 当前长度
    cap: usize,       // 容量
}
// 共24字节（64位）
```

**4. String：**
```rust
struct String {
    vec: Vec<u8>      // 底层Vec<u8>
}
```

**5. HashMap：**
```rust
// 基于Robin Hood哈希
base: *mut u8
ctrl: *mut u8
cap: usize
// ...
```

### 三、异常目录和TLS回调分析

**Rust TLS回调（Windows）：**
```c
// 在.rdata$T段中可能包含
PIMAGE_TLS_CALLBACK rust_tls_callback = {
    rust_eh_personality,  // 异常处理
    rust_stack_exceeded   // 栈检查
};
```

**识别方法：**
1. 检查PE文件的TLS目录
2. 查看回调函数列表
3. 分析回调中的Rust运行时初始化

### 四、闭包分析

**闭包内存布局：**
```rust
// 闭包被编译为结构体 + 调用函数
struct Closure {
    env: *mut (),        // 捕获环境指针
    call: fn(),          // 调用函数指针
}

// 捕获变量存储在堆或栈上
```

**识别闭包调用：**
```asm
; 闭包调用模式
lea rdi, [closure_env]   ; 环境指针
call [closure_fn]        ; 调用闭包函数
```

### 五、Trait对象分析

**动态分发：**
```rust
// Trait对象内存布局
struct TraitObject {
    data: *mut (),       // 数据指针
    vtable: *mut (),     // vtable指针
}

// vtable结构：
// [0]: drop指针
// [1]: size
// [2]: alignment
// [3+]: 方法指针
```

**识别特征：**
```asm
; 动态分发调用
mov rax, [obj]           ; 数据指针
mov rcx, [obj+8]         ; vtable指针
call [rcx+method_offset] ; 通过vtable调用
```

### 六、宏生成的代码模式

**1. match表达式：**
```rust
match value {
    Pattern1 => expr1,
    Pattern2 => expr2,
    _ => default,
}
```
编译后：跳转表或if-else链

**2. ?操作符：**
```rust
let x = func()?;
```
编译后：
```asm
call func
test rax, rax           ; 检查Result/Option
jz error_path
```

**3. 迭代器链：**
```rust
vec.iter().map(|x| x*2).filter(|x| *x > 10).collect();
```
编译后：可能内联为循环

## 常见误区

- **误区1**：Rust符号与C++相同
  - ✅ 真实情况：Rust使用不同的name mangling（类似但不同）
  
- **误区2**：Rust没有运行时
  - ✅ 真实情况：有标准运行时（panic处理、分配器等）
  
- **误区3**：Rust字符串都是String类型
  - ✅ 真实情况：大量使用&str（切片），需识别ptr+len模式
  
- **误区4**：Rust生成的代码难以阅读
  - ✅ 真实情况：虽然冗长但结构清晰，有模式可循

## 失败信号与转向条件

- **自定义分配器**：需跟踪新的分配函数
- **高度优化（LTO）**：函数内联严重，失去结构边界
- **混淆处理**：控制流平坦化等需先去混淆
- `#![no_std]`二进制：缺少标准库特征，分析难度增加

## 工具与脚本

### Rust专用工具

| 工具 | 功能 | 安装 |
|-----|------|------|
| rustfilt | 还原Rust符号 | `cargo install rustfilt` |
| cargo-bloat | 分析二进制大小 | `cargo install cargo-bloat` |
| twiggy | 代码大小分析器 | `cargo install twiggy` |

### IDA/Ghidra插件

**rust-ghidra（社区插件）：**
- 识别Rust标准库函数
- 恢复panic处理流程
- 类型恢复辅助

### 辅助脚本

**符号还原：**
```bash
# 还原Rust符号
rustfilt < symbols.txt > demangled.txt

# 或在IDA/Ghidra中使用
# 设置demangler为Rust模式
```

**Ghidra导入Rust类型：**
```python
# rust_types.py
# 导入常见Rust类型定义

def define_rust_types():
    # Option<T>
    option = StructureDataType("Option", 0)
    option.add(ByteDataType(), "tag", "是否Some")
    # 添加泛型占位
    
    # Result<T, E>
    result = StructureDataType("Result", 0)
    result.add(ByteDataType(), "tag", "0=Ok, 1=Err")
    
    # Vec<T>
    vec = StructureDataType("Vec", 24)
    vec.add(PointerDataType(), "buf", "缓冲区指针")
    vec.add(QWordDataType(), "len", "长度")
    vec.add(QWordDataType(), "cap", "容量")
```

## 记录规范

- **样本 hash**：
- **Rust版本**：从.comment段提取
- **优化级别**：debug/release
- **是否strip**：符号表完整性
- **特殊特征**：自定义allocator、no_std等

## 参考案例

- Luca Stealer（Rust编写的信息窃取器）
- BlackCat勒索软件Rust变种
- CTF中Rust二进制挑战（Huntress CTF 2024 OceanLocust/Rustline）

## 相关专题

- [字符串混淆模式](./string-obfuscation-patterns.md) - 字符串处理
- [控制流平坦化](./control-flow-flattening.md) - 混淆处理
- [x64调试流程](../workflows/x64-debugging-workflow.md) - 调试技巧

## 参考资源

- Rust语言参考: https://doc.rust-lang.org/reference/
- Rust ABI文档: https://rust-lang.github.io/abi/
- JPCERT/CC Rust分析报告: https://www.jpcert.or.jp/
- rust-ghidra: https://github.com/izhden/rust-ghidra

## 后续待补

- [ ] async/await状态机分析
- [ ] Rust WASM目标分析
- [ ] 嵌入式Rust（no_std）
- [ ] Rust与C FFI边界分析
