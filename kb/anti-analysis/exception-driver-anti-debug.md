---
id: anti-analysis-exception-driver-anti-debug
title: 异常驱动反调试
category: anti-analysis
tags: [anti-analysis, ctf, exception, driver, anti, debug, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 异常驱动反调试

## 适用场景

- 识别基于 SEH/VEH 的反调试
- 绕过异常处理链检测
- 分析 INT 2D、INT 3 等异常指令反调试

## 识别信号

### SEH (Structured Exception Handling) 滥用技术

**SEH工作原理：**
1. 异常发生时，系统遍历SEH链
2. 每个处理器有机会处理异常
3. 如果处理器返回`EXCEPTION_CONTINUE_EXECUTION`，继续执行
4. 如果返回`EXCEPTION_EXECUTE_HANDLER`，执行处理程序
5. 如果返回`EXCEPTION_CONTINUE_SEARCH`，继续遍历

**反调试原理：** 当调试器存在时，它会首先捕获异常，改变正常的异常处理流程。

**检测代码：**
```c
BOOL isDebugged = TRUE;
__try {
    __try {
        // 产生异常
        __asm int 3h;  // 或除零、非法指令等
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        // 异常被SEH捕获，说明没有调试器
        isDebugged = FALSE;
    }
}
__finally {
    // 清理代码
}

if (isDebugged) {
    ExitProcess(-1);
}
```

**Trap Flag (TF) 检测：**
```c
BOOL isDebugged = TRUE;
__try {
    __asm {
        pushfd
        or dword ptr[esp], 0x100  // 设置Trap Flag
        popfd                     // 加载到EFLAGS
        nop                       // 如果调试器存在，这里会触发单步异常
    }
}
__except (EXCEPTION_EXECUTE_HANDLER) {
    // 异常被捕获，说明没有调试器或调试器未处理
    isDebugged = FALSE;
}
```

### VEH (Vectored Exception Handler) 反调试

**VEH特点：**
- Windows XP引入的异常处理扩展
- 非基于帧的异常处理器
- 优先级高于SEH
- 存储在`ntdll!LdrpVectorHandlerList`中

**检测原理：** 注册VEH处理器后产生异常，如果调试器存在，异常会被调试器先捕获，VEH处理器不会执行。

**检测代码：**
```c
LONG CALLBACK VectoredHandler(PEXCEPTION_POINTERS ExceptionInfo) {
    PCONTEXT ctx = ExceptionInfo->ContextRecord;
    
    // 检查硬件断点
    if (ctx->Dr0 != 0 || ctx->Dr1 != 0 || 
        ctx->Dr2 != 0 || ctx->Dr3 != 0) {
        ExitProcess(-1);
    }
    
    // 修复EIP继续执行
    ctx->Eip += 2;  // 跳过int 3指令
    return EXCEPTION_CONTINUE_EXECUTION;
}

int main() {
    // 注册VEH处理器
    AddVectoredExceptionHandler(1, VectoredHandler);
    
    __asm int 3h;  // 产生断点异常
    
    // 如果执行到这里，说明没有调试器
    // 如果调试器存在，这里不会执行
    printf("No debugger detected\n");
    return 0;
}
```

**硬件断点检测：**
```c
LONG CALLBACK ExceptionHandler(PEXCEPTION_POINTERS ExceptionInfo) {
    PCONTEXT ctx = ExceptionInfo->ContextRecord;
    
    // 检查调试寄存器
    if (ctx->ContextFlags & CONTEXT_DEBUG_REGISTERS) {
        if (ctx->Dr0 || ctx->Dr1 || ctx->Dr2 || ctx->Dr3) {
            printf("Hardware breakpoints detected!\n");
            ExitProcess(-1);
        }
    }
    
    ctx->Eip += 1;  // 跳过异常指令
    return EXCEPTION_CONTINUE_EXECUTION;
}
```

### 自定义异常分发器

**INT 2D 反调试：**
```asm
; INT 2D是内核调试器使用的指令
; 在用户模式调试器下行为异常
int 2dh
nop          ; 如果调试器存在，可能跳过这条指令
```

**INT 3 变体：**
```asm
; 标准INT 3
cc

; ICEBP (F1) - 单字节调试异常
f1

; INT1 - 单步异常
cd 01
```

## 判断依据

### SEH链遍历代码

```c
// 手动遍历SEH链
__asm {
    mov eax, fs:[0]      ; 获取第一个SEH记录
next_seh:
    test eax, eax
    je end_seh
    mov eax, [eax]       ; 获取下一个SEH记录
    jmp next_seh
end_seh:
}
```

### VEH注册模式

```c
// 典型VEH反调试模式
AddVectoredExceptionHandler(0, Handler);  // 注册处理器
RaiseException(EXCEPTION_BREAKPOINT, 0, 0, NULL);  // 产生异常
// 或者使用 __asm int 3

// 处理器内检查上下文
LONG CALLBACK Handler(PEXCEPTION_POINTERS info) {
    if (info->ExceptionRecord->ExceptionCode == EXCEPTION_BREAKPOINT) {
        // 执行到这里说明没有调试器拦截
    }
    return EXCEPTION_CONTINUE_EXECUTION;
}
```

## 处理思路

### 手动传递异常

**WinDbg命令：**
```windbg
; 传递所有异常给应用程序
.foreach(exc {.echo "ct et cpr epr ld ud ser ibp iml out av asrt aph bpe bpec eh clr clrn cce cc dm dbce gp ii ip dz iov ch hc lsq isc 3c svh sse ssec sbo sov vs vcpp wkd rto rtt wob wos *"}) {.catch{sxd ${exc}}}

; 或使用GUI设置：Debug -> Event Filters -> 选择异常 -> Handled
```

**x64dbg设置：**
```
选项 -> 事件 -> 忽略所有异常 (不推荐)
或针对特定异常设置
```

### KiUserExceptionDispatcher Hook

**绕过VEH硬件断点检查：**
```c
typedef VOID (NTAPI *pfnKiUserExceptionDispatcher)(
    PEXCEPTION_RECORD pExcptRec, 
    PCONTEXT ContextFrame
);

VOID NTAPI HookKiUserExceptionDispatcher(
    PEXCEPTION_RECORD pExcptRec, 
    PCONTEXT ContextFrame
) {
    // 清除调试寄存器，隐藏硬件断点
    if (ContextFrame && (ContextFrame->ContextFlags & CONTEXT_DEBUG_REGISTERS)) {
        ContextFrame->Dr0 = 0;
        ContextFrame->Dr1 = 0;
        ContextFrame->Dr2 = 0;
        ContextFrame->Dr3 = 0;
        ContextFrame->Dr6 = 0;
        ContextFrame->Dr7 = 0;
        ContextFrame->ContextFlags &= ~CONTEXT_DEBUG_REGISTERS;
    }
    
    // 调用原始函数
    g_origKiUserExceptionDispatcher(pExcptRec, ContextFrame);
}
```

### TitanHide 驱动级绕过

**TitanHide功能：**
- 内核级SSDT钩子
- 隐藏调试器对目标进程的影响
- 处理INT 2D等异常指令

**使用方法：**
```powershell
# 安装驱动（测试模式）
bcdedit.exe /set nointegritychecks on
bcdedit.exe -set loadoptions DISABLE_INTEGRITY_CHECKS
bcdedit.exe -set TESTSIGNING ON

# 复制驱动
copy TitanHide.sys %systemroot%\system32\drivers\

# 创建服务
sc create TitanHide binPath= %systemroot%\system32\drivers\TitanHide.sys type= kernel
sc start TitanHide

# 使用TitanHideGUI.exe配置选项
```

### ScyllaHide VEH绕过

```ini
# scylla_hide.ini 配置
HOOK_RtlDispatchException=1
HOOK_KiUserExceptionDispatcher=1
```

### Patch异常产生指令

```asm
; 找到int 3 (0xCC), int 1 (0xCD 0x01), int 2d (0xCD 0x2D)
; 替换为NOP (0x90)
; 或者修改跳转逻辑
```

## 常见误区

| 误区 | 正确认识 |
|-----|---------|
| "忽略所有异常即可" | 可能影响程序正常功能 |
| "VEH比SEH更难绕过" | 两者原理相似，绕过方法相通 |
| "硬件断点无法隐藏" | 可以通过Hook或驱动层清除调试寄存器 |
| "INT 2D 只能在内核调试器使用" | 用户模式也可产生，行为特殊 |

## 相关工具

| 工具 | 类型 | 功能 |
|------|------|------|
| **TitanHide** | 内核驱动 | SSDT钩子，绕过各种异常检测 |
| **ScyllaHide** | 用户模式 | 绕过VEH/SEH检测，Hook异常分发 |
| **x64dbg** | 调试器 | 内置异常处理选项 |
| **Cheat Engine** | 内存工具 | VEH调试器模式 |
| **WinDbg** | 内核调试器 | 内核级异常控制 |

## 实战技巧

### 分析SEH/VEH链

```windbg
; WinDbg查看VEH列表
x ntdll!LdrpVectorHandlerList

; 查看SEH链
!exchain

; 查看异常分发
u ntdll!RtlDispatchException
u ntdll!KiUserExceptionDispatcher
```

### 设置断点捕获异常处理

```windbg
; 在ExecuteHandler2设置断点
bp ntdll!ExecuteHandler2+0x24  ; x86 call指令位置

; 在VEH调用处设置断点
bp ntdll!RtlpCallVectoredHandlers+0xba
```

## 参考资源

- [Check Point Anti-Debug Tricks](https://anti-debug.checkpoint.com/)
- [TitanHide GitHub](https://github.com/mrexodia/TitanHide)
- [ScyllaHide GitHub](https://github.com/x64dbg/ScyllaHide)
