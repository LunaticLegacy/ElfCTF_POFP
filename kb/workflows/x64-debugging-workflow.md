---
id: workflows-x64-debugging-workflow
title: x64 调试与 WOW64 场景
category: workflows
tags: [workflows, ctf, x64, debugging, workflow, wow64, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# x64 调试与 WOW64 场景

## 适用场景

- 分析 x64 架构的程序
- 处理 WOW64 混合架构调试
- 识别 x64 调用约定和参数传递

## 技术背景

### x64 调用约定核心规则

**参数传递规则：**

| 参数位置 | 整数/指针 | 浮点数 |
|---------|----------|--------|
| 第1个参数 | RCX | XMM0 |
| 第2个参数 | RDX | XMM1 |
| 第3个参数 | R8 | XMM2 |
| 第4个参数 | R9 | XMM3 |
| 第5个及以后 | 栈（RSP+40 开始） | 栈 |

**关键特性：**
- **寄存器传参**：前4个参数通过寄存器传递，而非 x86 的栈传递
- **栈对齐要求**：调用前栈必须 16 字节对齐
- **Shadow Space（Home Space）**：调用者必须在栈上预留 32 字节空间，供被调函数保存寄存器参数
- **返回值**：整数/指针返回在 RAX，浮点数返回在 XMM0

**示例汇编代码：**
```asm
; 调用 MessageBoxA(hWnd, lpText, lpCaption, uType)
sub rsp, 40             ; 32字节 Shadow Space + 8字节对齐 = 40
xor ecx, ecx            ; hWnd = NULL (第1参数)
lea rdx, [msg]          ; lpText (第2参数)
lea r8, [title]         ; lpCaption (第3参数)
mov r9d, 0              ; uType = MB_OK (第4参数)
call MessageBoxA
add rsp, 40             ; 恢复栈
```

### 寄存器使用规则

**易失性寄存器（Volatile / Caller-Saved）：**
| 寄存器 | 用途 |
|--------|------|
| RAX | 返回值 |
| RCX | 第1参数 |
| RDX | 第2参数 |
| R8-R9 | 第3-4参数 |
| R10-R11 | 临时使用，syscall 指令使用 |
| XMM0-XMM5 | 浮点参数/临时使用 |

**非易失性寄存器（Non-Volatile / Callee-Saved）：**
| 寄存器 | 用途 |
|--------|------|
| RBX | 被调函数必须保存/恢复 |
| RBP | 可作为帧指针 |
| RDI, RSI | 被调函数必须保存/恢复 |
| R12-R15 | 被调函数必须保存/恢复 |
| RSP | 栈指针 |
| XMM6-XMM15 | 浮点寄存器，被调函数保存 |

### 栈帧对齐要求（16字节对齐）

**核心规则：**
- CALL 指令会将 8 字节返回地址压入栈，导致栈指针未对齐
- 函数必须在 prologue 中确保栈重新对齐到 16 字节边界
- 函数体内（非 prologue/epilogue）栈必须始终保持 16 字节对齐

**对齐计算示例：**
```asm
; 函数 prologue
push rbp                ; +8 字节（返回地址已在栈上）
mov rbp, rsp
sub rsp, 0x20           ; 分配 32 字节局部变量
                        ; 总栈使用：8(返回地址) + 8(RBP) + 32 = 48（16对齐）
```

### x64 SEH 链与 Unwind 信息

**与 x86 的差异：**
- x86 使用基于栈的 SEH 链（fs:[0] 指向 EXCEPTION_REGISTRATION_RECORD 链表）
- **x64 使用表驱动的异常处理**，Unwind 信息存储在 PE 文件的 Exception Directory 中

**Unwind 信息结构：**
```c
typedef struct _UNWIND_INFO {
    UBYTE Version : 3;       // 版本号（通常为1或2）
    UBYTE Flags : 5;         // 标志（如UNW_FLAG_EHANDLER）
    UBYTE SizeOfProlog;      // Prologue 代码大小
    UBYTE CountOfCodes;      // Unwind 代码数量
    UBYTE FrameRegister : 4; // 帧寄存器（如RBP）
    UBYTE FrameOffset : 4;   // 帧寄存器偏移
    UNWIND_CODE UnwindCode[1]; // Unwind 代码数组
} UNWIND_INFO;
```

**常见 Unwind 代码类型：**
| 代码 | 描述 | 对应指令 |
|------|------|----------|
| UWOP_PUSH_NONVOL | 保存非易失性寄存器 | push rbx/rbp/r12-r15 |
| UWOP_ALLOC_LARGE/SMALL | 分配栈空间 | sub rsp, N |
| UWOP_SET_FPREG | 设置帧指针 | mov rbp, rsp |

### WOW64 架构详解

**什么是 WOW64：**
WOW64（Windows-on-Windows 64-bit）是 Windows 64 位系统上的子系统，允许 32 位应用程序在 64 位 Windows 上运行。

**核心组件：**
| DLL | 功能 |
|-----|------|
| wow64.dll | WOW64 核心逻辑，处理上下文切换 |
| wow64cpu.dll | 处理 32/64 位模式切换（Heaven's Gate） |
| wow64win.dll | 提供 Windows API 转换层 |
| ntdll.dll（32位和64位各一个） | 系统调用接口 |

**地址空间布局：**
- 32 位进程在 WOW64 下运行在 4GB 地址空间内（0x00000000 - 0xFFFFFFFF）
- 64 位系统组件（WOW64 DLLs）映射在 4GB 以上的地址空间
- 每个 WOW64 线程同时维护 32 位和 64 位两套 TEB/PEB

**Heaven's Gate（天堂之门）：**
- 32 位代码通过 `wow64cpu.dll` 切换到 64 位模式执行系统调用
- 该技术可被恶意软件利用进行反调试

### 32位调试器分析64位程序的问题

**主要问题：**
1. **上下文获取不完整**：32 位调试器无法正确获取 64 位线程的完整上下文
2. **调用栈解析错误**：WOW64 层的 64 位代码会导致调用栈混乱
3. **内存访问受限**：无法访问 4GB 以上的地址空间
4. **模式切换问题**：无法正确处理 Heaven's Gate 切换

**调试转储文件问题：**
- 使用 64 位 Task Manager 创建的 32 位进程转储是 64 位格式
- 直接使用 32 位 WinDbg 分析会得到混乱的调用栈
- 需要使用 `!wow64exts.sw` 命令切换模式

## 分析步骤

### x64 函数参数识别流程

**步骤1：识别函数调用位置**
- 查找 `call` 指令位置
- 记录调用前 RSP 值以计算参数位置

**步骤2：检查寄存器参数**
```
RCX = 第1个参数
RDX = 第2个参数
R8  = 第3个参数
R9  = 第4个参数
```

**步骤3：检查栈参数**
- 第5个及以后参数位于 `RSP + 0x28`（考虑 Shadow Space）
- 每个参数占 8 字节，按 8 字节对齐

**步骤4：识别参数类型**
- 整数/指针：直接显示值或指向的内存
- 浮点数：检查 XMM 寄存器
- 结构体：根据大小（8/16/32/64位直接传值，更大则传指针）

### WOW64 进程调试流程

**步骤1：确定进程类型**
```bash
# 使用 IsWow64Process API 检测
# 或使用任务管理器查看进程架构
```

**步骤2：选择合适调试器**
- 分析 32 位代码：使用 32 位调试器（x32dbg）
- 分析 64 位 WOW64 层：使用 64 位调试器（x64dbg/WinDbg x64）

**步骤3：模式切换（WinDbg）**
```
0:000> .load wow64exts        # 加载 WOW64 扩展
0:000> !wow64exts.sw          # 在 32/64 位模式间切换
```

**步骤4：查看双重视图**
```
0:000> !wow64exts.info        # 显示 PEB/TEB 信息
0:000> !wow64exts.k 5         # 显示混合 32/64 位调用栈
```

## 工具配置

### x64dbg 配置

**推荐配置项：**
1. **Events（事件设置）**
   - 勾选 "DLL Entry Point" - 在 DLL 入口点暂停
   - 勾选 "TLS Callbacks" - 捕获 TLS 回调函数

2. **Options -> Preferences**
   - 设置默认断点为 "Hardware Breakpoint"（硬件断点）
   - 启用 "Scan APIs" 自动识别 API

3. **插件推荐**
   - ScyllaHide：反反调试
   - xAnalyzer：自动函数分析
   - TraceRecord：指令追踪

### WinDbg x64 配置

**符号配置：**
```
.sympath srv*C:\Symbols*https://msdl.microsoft.com/download/symbols
.reload
```

**常用扩展：**
```
.load wow64exts           # WOW64 调试
.load byakugan            # 内存搜索
```

## 实战技巧

### 快速定位函数参数

**技巧1：函数入口处检查**
```asm
; 在函数首指令处断下
mov rax, [rsp+0x28]      ; 获取第5个参数（返回地址在rsp，shadow space占0x20）
```

**技巧2：利用 Shadow Space**
- 被调函数可以在 Shadow Space 中保存寄存器参数
- 检查 `[RSP+8]` 到 `[RSP+0x20]` 区域查看保存的参数值

### WOW64 调试技巧

**技巧1：识别 WOW64 转换**
- 在 `wow64cpu.dll` 中的 `TurboDispatchJumpAddressEnd` 设置断点
- 可捕获所有 32->64 位系统调用转换

**技巧2：获取 32 位上下文**
```
!wow64exts.r              # 显示 32 位寄存器上下文
```

## 常见问题和解决方案

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 调用栈显示 wow64 层代码 | 调试器处于 64 位模式 | 使用 `!wow64exts.sw` 切换到 32 位模式 |
| 参数值不正确 | 未考虑 Shadow Space | 记住前4参数在寄存器，第5个在 RSP+0x28 |
| 对齐错误导致崩溃 | 栈未 16 字节对齐 | 检查 prologue 中的栈调整 |
| 无法设置断点 | 代码尚未映射 | 使用 `sxe ld:模块名` 在加载时断下 |
| 调试 WOW64 进程时混乱 | 使用了错误的调试器位数 | 分析 32 位代码用 x32dbg，WOW64 层用 x64dbg |

## 快速参考

### x64 调用约定速查

```
参数位置    整数/指针      浮点数
────────    ─────────      ──────
第1个       RCX            XMM0
第2个       RDX            XMM1
第3个       R8             XMM2
第4个       R9             XMM3
第5个+      [RSP+0x28]     [RSP+0x28]

返回值      RAX            XMM0
Shadow Space: 32 bytes at [RSP+8] to [RSP+0x28]
栈对齐: 16-byte aligned before CALL
```

## 参考案例

- `prompts/reverse/monster_invasion/`（PE32+ x64 程序）

## 参考资源

- Windows x64 Calling Convention 文档
- WinDbg 文档
