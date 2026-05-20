---
id: anti-analysis-peb-beingdebugged-check
title: PEB BeingDebugged 检查与绕过
category: anti-analysis
tags: [anti-analysis, ctf, peb, beingdebugged, check, authorized-analysis, malware-research]
difficulty: beginner
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# PEB BeingDebugged 检查与绕过

## 适用场景

- 识别基于 PEB 的反调试检测
- 绕过 IsDebuggerPresent 等 API 检测
- 分析 NtGlobalFlag 和堆标志检测

## 识别信号

### PEB 结构访问方式

```asm
; x86 (32位)
mov eax, fs:[0x30]    ; TEB.ProcessEnvironmentBlock

; x64 (64位)
mov rax, gs:[0x60]    ; TEB.ProcessEnvironmentBlock

; WOW64 (32位在64位系统)
mov eax, fs:[0x30]    ; 需要特殊处理WOW64情况
```

### 关键字段偏移

| 字段 | x86偏移 | x64偏移 | 说明 |
|------|---------|---------|------|
| BeingDebugged | 0x02 | 0x02 | 调试标志 |
| NtGlobalFlag | 0x68 | 0xBC | 全局标志 |
| ProcessHeap | 0x18 | 0x30 | 堆基址指针 |
| Ldr | 0x0C | 0x18 | 模块加载器 |

### BeingDebugged 字段检查

**检测逻辑：**
- 值为 `0x0`：未调试
- 值为 `0x1`：正在被调试

**汇编代码特征：**
```asm
; x86检测代码
mov eax, fs:[30h]           ; 获取PEB
cmp byte ptr [eax+2], 0     ; 检查BeingDebugged
jne debugger_detected

; x64检测代码
mov rax, gs:[60h]           ; 获取PEB
cmp byte ptr [rax+2], 0     ; 检查BeingDebugged
jne debugger_detected
```

### NtGlobalFlag 检查

当进程由调试器创建时，Windows堆管理器会在PEB.NtGlobalFlag中设置以下标志：

| 标志 | 值 | 说明 |
|------|-----|------|
| FLG_HEAP_ENABLE_TAIL_CHECK | 0x10 | 堆尾检查 |
| FLG_HEAP_ENABLE_FREE_CHECK | 0x20 | 堆释放检查 |
| FLG_HEAP_VALIDATE_PARAMETERS | 0x40 | 参数验证 |

**正常值：** `0x0`  
**调试时值：** `0x70` (0x10 | 0x20 | 0x40)

**检测代码：**
```asm
mov al, [eax+68h]           ; x86: 读取NtGlobalFlag
and al, 70h                 ; 检查组合标志
cmp al, 70h
jz debugger_detected
```

### HeapFlags 检查

通过PEB.ProcessHeap访问堆结构，检查Flags和ForceFlags字段：

**堆标志偏移（Windows Vista及以上）：**
- x86: Flags偏移 `0x40`，ForceFlags偏移 `0x44`
- x64: Flags偏移 `0x70`，ForceFlags偏移 `0x74`

**正常值：**
- Flags: `HEAP_GROWABLE (0x2)`
- ForceFlags: `0x0`

**调试时值：**
- Flags: `0x50000062` (Win7+) 或 `0x50000002` (WinXP)
- ForceFlags: `0x40000060`

**检测代码：**
```c
// 获取PEB和ProcessHeap
PPEB peb = (PPEB)__readgsqword(0x60);
PVOID heapBase = *(PVOID*)((PBYTE)peb + 0x30);

// 检查堆标志
DWORD flags = *(PDWORD)((PBYTE)heapBase + 0x70);
DWORD forceFlags = *(PDWORD)((PBYTE)heapBase + 0x74);

if (flags != HEAP_GROWABLE || forceFlags != 0) {
    // 检测到调试器
}
```

## 判断依据

### API调用链

```c
// 1. 标准API检测
IsDebuggerPresent() → 读取PEB.BeingDebugged

// 2. 远程调试检测
CheckRemoteDebuggerPresent() → NtQueryInformationProcess(ProcessDebugPort)

// 3. NtQueryInformationProcess多种检测
NtQueryInformationProcess(
    ProcessDebugPort,       // 返回值非0表示调试
    ProcessDebugFlags,      // 返回0表示调试
    ProcessDebugObjectHandle // 返回非空句柄表示调试
);
```

### 手动PEB遍历模式

```c
#ifdef _WIN64
    PPEB peb = (PPEB)__readgsqword(0x60);
#else
    PPEB peb = (PPEB)__readfsdword(0x30);
#endif

// 多种标志组合检查
if (peb->BeingDebugged) exit(1);
if (peb->NtGlobalFlag & 0x70) exit(1);
// 堆标志检查...
```

## 处理思路

### 手动Patch方法

**x64dbg/OllyDbg手动修改：**
```asm
; 在命令窗口执行
; x64:  dump at gs:[60]
; x86:  dump at fs:[30]

; 修改BeingDebugged (offset 0x02)
db [PEB+2], 0

; 修改NtGlobalFlag (x64 offset 0xBC, x86 offset 0x68)
dd [PEB+0xBC], 0
```

**OllyScript自动Patch：**
```ollyscript
var peb
var process_heap

// 获取PEB
mov peb, [fs:0x30]

// Patch BeingDebugged
mov byte ptr [peb+2], 0

// Patch NtGlobalFlag
lea patch_addr, [peb+68]
mov [patch_addr], 0

// Patch Heap Flags
mov process_heap, [peb+18]
mov [process_heap+C], 2    ; Flags = HEAP_GROWABLE
mov [process_heap+10], 0   ; ForceFlags = 0
```

### DLL注入Patch

```c
// 注入代码设置PEB字段
#ifndef _WIN64
PPEB pPeb = (PPEB)__readfsdword(0x30);
*(PDWORD)((PBYTE)pPeb + 0x68) = 0;  // NtGlobalFlag
#else
PPEB pPeb = (PPEB)__readgsqword(0x60);
*(PDWORD)((PBYTE)pPeb + 0xBC) = 0;  // NtGlobalFlag
#endif
pPeb->BeingDebugged = 0;
```

### API Hook绕过

```c
// Hook NtQueryInformationProcess
NTSTATUS NTAPI HookedNtQueryInformationProcess(
    HANDLE ProcessHandle,
    PROCESSINFOCLASS ProcessInformationClass,
    PVOID ProcessInformation,
    ULONG ProcessInformationLength,
    PULONG ReturnLength
) {
    NTSTATUS status = OriginalNtQueryInformationProcess(
        ProcessHandle, ProcessInformationClass, 
        ProcessInformation, ProcessInformationLength, ReturnLength);
    
    if (NT_SUCCESS(status)) {
        switch (ProcessInformationClass) {
            case ProcessDebugPort:
                *(PDWORD)ProcessInformation = 0;
                break;
            case ProcessDebugFlags:
                *(PDWORD)ProcessInformation = 1;
                break;
            case ProcessDebugObjectHandle:
                *(PHANDLE)ProcessInformation = NULL;
                break;
        }
    }
    return status;
}
```

## 常见误区

| 误区 | 正确认识 |
|-----|---------|
| "只需修改 BeingDebugged 即可" | 现代反调试通常组合多种标志检查 |
| "x86/x64 偏移相同" | NtGlobalFlag 等字段偏移不同，需分别处理 |
| "Patch 一次即可" | 有些程序会周期性重新检查，需要持续保持 |
| "WOW64 与 x86 相同" | WOW64 进程有两个PEB块，需要分别处理 |

## 相关工具

| 工具 | 类型 | 功能说明 |
|------|------|----------|
| **ScyllaHide** | 用户模式插件 | 开源x86/x64反反调试库，支持x64dbg/OllyDbg/IDA |
| **TitanHide** | 内核模式驱动 | SSDT钩子驱动，隐藏调试器痕迹 |
| **SharpOD** | OllyDbg插件 | 国产反反调试插件 |
| **mhook** | 库 | 用于API钩子的Windows库 |
| **InjectorCLI** | 注入工具 | ScyllaHide的命令行注入器 |

## ScyllaHide配置要点

```ini
# scylla_hide.ini 关键配置
PEB_PATCH_BeingDebugged=1
PEB_PATCH_NtGlobalFlag=1
PEB_PATCH_HeapFlags=1
PEB_PATCH_OsBuildNumber=1

# 钩子开关
HOOK_NtQueryInformationProcess=1
HOOK_NtSetInformationThread=1
HOOK_NtCreateThreadEx=1
```

## 多版本Windows兼容性处理

- Windows XP: HeapFlags偏移 `0x0C/0x10`
- Windows Vista+: HeapFlags偏移 `0x40/0x44` (x86), `0x70/0x74` (x64)
- WOW64进程有两个PEB块：peb (32位) 和 peb64

## 参考案例

- `prompts/reverse/peek_stack/`（基础 PE32 分析，可延伸讨论 PEB）

## 参考资源

- [Check Point Anti-Debug Tricks](https://anti-debug.checkpoint.com/)
- [ScyllaHide GitHub](https://github.com/x64dbg/ScyllaHide)
- [TitanHide GitHub](https://github.com/mrexodia/TitanHide)
- SysWhispers4 - 现代syscall和反调试技术集合
