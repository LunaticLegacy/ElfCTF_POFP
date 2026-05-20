---
id: reversing-reverse-engineering-knowledge-base
title: 逆向工程分析流程技术知识库
category: reversing
tags: [reversing, ctf, reverse, engineering, knowledge, base, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 逆向工程分析流程技术知识库

> 本知识库包含 x64 调试流程与 WOW64 场景、DLL 分析流程两大主题的专业知识总结。

---

## 主题一：x64 调试流程与 WOW64 场景

### 1. 技术背景

#### 1.1 x64 架构概述

Windows x64 平台采用与 x86 完全不同的 ABI（Application Binary Interface）。与 x86 支持多种调用约定（stdcall、fastcall、thiscall 等）不同，**x64 平台只支持一种标准的调用约定**，这简化了逆向分析中的参数识别工作。

#### 1.2 x64 调用约定核心规则

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

#### 1.3 寄存器使用规则

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

#### 1.4 栈帧对齐要求（16字节对齐）

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

#### 1.5 x64 SEH 链与 Unwind 信息

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

#### 1.6 WOW64 架构详解

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

#### 1.7 32位调试器分析64位程序的问题

**主要问题：**
1. **上下文获取不完整**：32 位调试器无法正确获取 64 位线程的完整上下文
2. **调用栈解析错误**：WOW64 层的 64 位代码会导致调用栈混乱
3. **内存访问受限**：无法访问 4GB 以上的地址空间
4. **模式切换问题**：无法正确处理 Heaven's Gate 切换

**调试转储文件问题：**
- 使用 64 位 Task Manager 创建的 32 位进程转储是 64 位格式
- 直接使用 32 位 WinDbg 分析会得到混乱的调用栈
- 需要使用 `!wow64exts.sw` 命令切换模式

### 2. 分析步骤

#### 2.1 x64 函数参数识别流程

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

#### 2.2 WOW64 进程调试流程

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

### 3. 工具配置

#### 3.1 x64dbg 配置

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

#### 3.2 WinDbg x64 配置

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

### 4. 实战技巧

#### 4.1 快速定位函数参数

**技巧1：函数入口处检查**
```asm
; 在函数首指令处断下
mov rax, [rsp+0x28]      ; 获取第5个参数（返回地址在rsp，shadow space占0x20）
```

**技巧2：利用 Shadow Space**
- 被调函数可以在 Shadow Space 中保存寄存器参数
- 检查 `[RSP+8]` 到 `[RSP+0x20]` 区域查看保存的参数值

#### 4.2 WOW64 调试技巧

**技巧1：识别 WOW64 转换**
- 在 `wow64cpu.dll` 中的 `TurboDispatchJumpAddressEnd` 设置断点
- 可捕获所有 32->64 位系统调用转换

**技巧2：获取 32 位上下文**
```
!wow64exts.r              # 显示 32 位寄存器上下文
```

### 5. 常见问题和解决方案

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 调用栈显示 wow64 层代码 | 调试器处于 64 位模式 | 使用 `!wow64exts.sw` 切换到 32 位模式 |
| 参数值不正确 | 未考虑 Shadow Space | 记住前4参数在寄存器，第5个在 RSP+0x28 |
| 对齐错误导致崩溃 | 栈未 16 字节对齐 | 检查 prologue 中的栈调整 |
| 无法设置断点 | 代码尚未映射 | 使用 `sxe ld:模块名` 在加载时断下 |
| 调试 WOW64 进程时混乱 | 使用了错误的调试器位数 | 分析 32 位代码用 x32dbg，WOW64 层用 x64dbg |

---

## 主题二：DLL 分析流程

### 1. 技术背景

#### 1.1 DLL 文件结构特点

DLL（Dynamic Link Library）是 Windows 平台的动态链接库，与 EXE 同属 PE（Portable Executable）格式，但具有以下特点：

**与 EXE 的核心差异：**
| 特性 | EXE | DLL |
|------|-----|-----|
| Image Base | 通常为 0x400000 | 通常为 0x10000000 |
| 入口点 | WinMain/main | DllMain |
| 导出表 | 可选 | 通常必须有 |
| 重定位表 | 可选 | 通常必须有 |
| 执行方式 | 直接启动 | 被加载后执行 |

**关键数据结构：**
- **导出表（Export Directory）**：列出 DLL 提供的函数
- **导入表（Import Directory）**：列出 DLL 依赖的其他模块
- **重定位表（Base Relocation Table）**：支持加载到非首选基址

#### 1.2 DLL 入口点机制

**DllMain 函数原型：**
```c
BOOL WINAPI DllMain(
    HINSTANCE hinstDLL,     // DLL 模块句柄
    DWORD fdwReason,        // 调用原因
    LPVOID lpvReserved      // 保留参数
);
```

**fdwReason 值：**
| 值 | 宏 | 含义 |
|----|-----|------|
| 1 | DLL_PROCESS_ATTACH | 进程首次加载 DLL |
| 0 | DLL_PROCESS_DETACH | 进程卸载 DLL |
| 2 | DLL_THREAD_ATTACH | 线程创建 |
| 3 | DLL_THREAD_DETACH | 线程结束 |

**入口点调用链：**
```
DllEntryPoint (PE Entry Point)
    ↓
_DllMainCRTStartup (CRT 启动代码)
    ↓
DllMain (用户代码)
```

**TLS 回调：**
- 在 DllMain 之前执行
- 位于 `.tls` 节的 TLS Callback Table 中
- 恶意软件常利用 TLS 回调提前执行代码

#### 1.3 导出函数分析

**导出表结构：**
```c
typedef struct _IMAGE_EXPORT_DIRECTORY {
    DWORD Characteristics;
    DWORD TimeDateStamp;
    WORD MajorVersion;
    WORD MinorVersion;
    DWORD Name;                    // DLL 名称 RVA
    DWORD Base;                    // 起始序号
    DWORD NumberOfFunctions;       // 导出函数总数
    DWORD NumberOfNames;           // 命名导出函数数
    DWORD AddressOfFunctions;      // 导出地址表 RVA
    DWORD AddressOfNames;          // 名称表 RVA
    DWORD AddressOfNameOrdinals;   // 序号表 RVA
} IMAGE_EXPORT_DIRECTORY;
```

**导出方式：**
1. **按名称导出**：通过函数名调用（如 `DllRegisterServer`）
2. **按序号导出**：通过索引号调用（如 `#1`、`#2`）
3. **转发导出**：转发到另一个 DLL 的函数

**常见导出函数名：**
| 函数名 | 用途 | 典型调用者 |
|--------|------|-----------|
| DllMain | DLL 入口点 | 系统加载器 |
| DllRegisterServer | 注册 COM 组件 | regsvr32.exe |
| DllUnregisterServer | 注销 COM 组件 | regsvr32.exe |
| DllInstall | 安装 DLL | regsvr32.exe /i |
| DllGetClassObject | 获取 COM 类工厂 | COM 系统 |
| DllCanUnloadNow | 查询是否可以卸载 | COM 系统 |

### 2. 分析步骤

#### 2.1 静态分析流程

**步骤1：PE 头分析**
- 使用 PE-bear、CFF Explorer、PEStudio 等工具
- 检查导出表、导入表、资源节
- 识别可疑特征（高熵值、异常节名、签名状态）

**步骤2：导出函数审查**
```
1. 列出所有导出函数名称和序号
2. 识别标准 COM/ActiveX 导出函数
3. 查找非标准导出（可能是恶意功能入口）
4. 检查导出函数地址是否指向可疑代码
```

**步骤3：入口点代码检查**
- 定位 DllMain 或 DllEntryPoint
- 检查 TLS 回调函数
- 分析初始化代码行为

**步骤4：字符串和导入分析**
- 提取明文字符串（C2 地址、文件名、注册表路径）
- 分析导入 API（可疑 API 调用序列）

#### 2.2 动态调试流程（使用 rundll32）

**方法：使用 rundll32.exe 作为加载器**

**步骤1：准备命令行**
```
rundll32.exe <DLL路径>,<导出函数名> [参数]
```

**步骤2：x64dbg 调试配置**
1. 打开 `C:\Windows\System32\rundll32.exe`（64位 DLL）
   或 `C:\Windows\SysWOW64\rundll32.exe`（32位 DLL）

2. **修改命令行参数**：
   ```
   Debug -> Change Command Line
   输入: "C:\Windows\System32\rundll32.exe" "C:\path\to\target.dll",ExportedFunction
   ```

3. **设置断点选项**：
   ```
   Options -> Preferences -> Events
   勾选 "DLL Entry Point" - 在 DLL 入口点暂停
   ```

4. **运行到目标 DLL**：
   - 按 F9 运行，直到在目标 DLL 的入口点停下
   - 观察窗口标题栏显示的当前模块名

**步骤3：定位导出函数**
- 在 Symbols 标签页找到目标导出函数
- 按 Ctrl+G 跳转到函数地址
- 设置断点并继续运行

#### 2.3 使用 regsvr32 分析 COM DLL

**注册 DLL：**
```
regsvr32.exe /s target.dll    # /s 表示静默模式
```

**调试方法：**
1. 在 x64dbg 中附加到 cmd.exe
2. 在 `CreateProcessInternalW` 设置断点
3. 执行 regsvr32 命令
4. 断下后，附加另一个调试器实例到 regsvr32 进程
5. 在 `DllRegisterServer` 设置断点

### 3. 工具配置

#### 3.1 PE 分析工具配置

**PE-bear 推荐配置：**
- 启用 "Rich Header" 分析（识别编译器/工具链）
- 检查 "Security" 选项卡（证书、数字签名）
- 查看 "Resources" 节（提取嵌入文件）

**Detect It Easy (DIE)：**
- 识别编译器和加壳工具
- 检查熵值分析加密/压缩节

#### 3.2 调试器配置

**x64dbg DLL 调试配置：**
```ini
; 在 x64dbg.ini 或配置中设置
[Events]
DllEntryPoint=1          # DLL 入口点断点
TlsCallbacks=1           # TLS 回调断点
LoadDll=0                # 不在每个 DLL 加载时断下
```

**WinDbg DLL 调试：**
```
# 加载 rundll32 并设置参数
windbg -g -G rundll32.exe C:\path\to\target.dll,ExportedFunc

# 在模块加载时断下
sxe ld:target.dll

# 继续运行到 DLL 加载
g

# 获取模块基址
lm m target

# 计算入口点地址并设置断点
bp <Base>+<EntryPoint RVA>
```

### 4. 实战技巧

#### 4.1 快速识别恶意 DLL 特征

**特征1：异常的导出函数**
- 导出函数名包含随机字符（如 `aBc3f9X`）
- 导出函数数量极少（仅1-2个）
- 导出函数地址相同（可能是壳代码）

**特征2：可疑的 DllMain 行为**
- 直接调用网络相关 API
- 创建新进程或线程
- 写入注册表 Run 键
- 加载其他 DLL

**特征3：TLS 回调滥用**
```c
// 检查 TLS 回调（IDA 中查看 .tls 节）
PIMAGE_TLS_CALLBACK TlsCallbacks[] = {
    MaliciousCallback,  // 在 DllMain 之前执行
    NULL
};
```

#### 4.2 DLL 侧加载（Side Loading）分析

**侧加载原理：**
1. 恶意 DLL 伪装成合法 DLL（同名）
2. 放置在程序目录（优先于系统目录加载）
3. 程序启动时加载恶意 DLL

**分析步骤：**
1. 检查目标程序导入表，识别依赖的 DLL
2. 分析每个 DLL 的加载路径优先级
3. 检查程序目录下是否存在可疑的 DLL
4. 对比系统目录和程序目录的 DLL 差异

**常见被滥用的 DLL：**
- `version.dll`
- `dwmapi.dll`
- `uxtheme.dll`
- `cryptbase.dll`

#### 4.3 反射型 DLL 注入检测

**反射型注入特征：**
- DLL 不通过 `LoadLibrary` 加载
- 手动映射到内存（使用 `VirtualAlloc` + 手动重定位）
- 不会在 PEB 的模块列表中显示
- 通常使用 RWX（读写执行）内存权限

**检测方法1：内存取证（Volatility）**
```bash
# 查找可疑内存区域
vol.py -f memory.dmp windows.malfind

# 检查异常 DLL
vol.py -f memory.dmp windows.dlllist
vol.py -f memory.dmp windows.ldrmodules  # 对比 PEB 和 VAD
```

**检测方法2：实时检测（Sysmon）**
```xml
<!-- Sysmon 配置示例 -->
<RuleGroup name="Reflective DLL Detection">
  <ProcessAccess onmatch="include">
    <GrantedAccess>PROCESS_VM_WRITE|PROCESS_VM_OPERATION</GrantedAccess>
  </ProcessAccess>
  <CreateRemoteThread onmatch="include">
    <StartFunction condition="contains">LoadLibrary</StartFunction>
  </CreateRemoteThread>
</RuleGroup>
```

**检测方法3：行为分析**
- 监控 `NtMapViewOfSection` 调用
- 检测无文件路径的内存映像
- 检查 RWX 内存区域的 MZ 头

### 5. 常见问题和解决方案

#### 5.1 调试问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| DllMain 没有被调用 | rundll32 需要指定导出函数 | 使用 `,DllMain` 或 `,#序数` 强制调用 |
| 断点不生效 | ASLR 导致基址随机化 | 使用模块相对地址或禁用 ASLR |
| 调试器在系统断点停止 | 默认系统断点 | 按 F9 继续到 DLL 入口点 |
| 无法加载符号 | 符号路径配置错误 | 设置正确的符号服务器路径 |

#### 5.2 分析问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 导出表为空 | DLL 可能使用反射加载 | 检查 .text 节中的 PE 头 |
| 字符串加密 | 字符串被加密/混淆 | 动态调试提取解密后字符串 |
| 导入表为空 | 使用动态 API 解析 | 跟踪 `GetProcAddress` 调用 |
| 高熵值 | 代码被加密或压缩 | 寻找解压/解密代码段 |

#### 5.3 注入检测问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 未检测到反射注入 | 使用了无头 PE（headerless） | 检查内存异常执行权限 |
| 误报率高 | 正常程序也有类似行为 | 使用多特征组合检测 |
| 无法 dump 内存 | DLL 已卸载或加密 | 在注入后立即 dump |

---

## 附录：快速参考表

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

### DLL 分析工具链

| 用途 | 工具 | 备注 |
|------|------|------|
| PE 静态分析 | PE-bear, CFF Explorer | 查看导出/导入表 |
| 数字签名 | PEStudio, Sigcheck | 验证签名有效性 |
| 字符串提取 | Strings, FLOSS | 查找 IoC |
| 动态调试 | x64dbg, WinDbg | 单步分析 |
| 内存取证 | Volatility 3 | 检测注入 |
| 行为监控 | Process Monitor | API 调用追踪 |

### 常见 DLL 导出函数用途

```
DllMain              - DLL 入口点
DllRegisterServer    - COM 注册（regsvr32 调用）
DllUnregisterServer  - COM 注销
DllInstall           - DLL 安装（regsvr32 /i）
DllGetClassObject    - COM 类工厂获取
DllCanUnloadNow      - 卸载检查
DllEntryPoint        - 入口点别名（IDA 显示）
```

---

*本文档由逆向工程知识库研究整理，适用于构建专业的恶意软件分析知识体系。*
