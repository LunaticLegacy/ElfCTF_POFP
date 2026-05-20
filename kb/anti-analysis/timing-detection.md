---
id: anti-analysis-timing-detection
title: 时间检测技术
category: anti-analysis
tags: [anti-analysis, ctf, timing, detection, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 时间检测技术

## 适用场景

- 识别基于时间的反调试检测
- 绕过 RDTSC、GetTickCount 等时间检测
- 分析时间差阈值判断逻辑

## 识别信号

### RDTSC 指令检测

**指令说明：**
- `RDTSC` (Read Time-Stamp Counter): 读取CPU时间戳计数器
- 返回64位值：EDX:EAX (高32位:低32位)
- 每个时钟周期计数器递增

**检测代码：**
```asm
; RDTSC基本检测
rdtsc
mov esi, eax        ; 保存低32位
mov edi, edx        ; 保存高32位

; ... 被检测的代码 ...

rdtsc
sub eax, esi        ; 计算差值
sbb edx, edi        ; 带借位减法
; 检查时间差是否超过阈值
```

**高级RDTSC检测（多核CPU保护）：**
```c
// 使用CPU亲和力确保在同一核心执行
SetThreadAffinityMask(GetCurrentThread(), 1);

uint64_t start = __rdtsc();
// ... 代码 ...
uint64_t end = __rdtsc();

if ((end - start) > THRESHOLD) {
    // 检测到调试器
}
```

### QueryPerformanceCounter (QPC)

**原理：** 使用高性能计数器测量时间间隔

**检测代码：**
```c
bool IsDebugged(DWORD64 qwNativeElapsed) {
    LARGE_INTEGER liStart, liEnd;
    QueryPerformanceCounter(&liStart);
    
    // ... 被检测代码 ...
    
    QueryPerformanceCounter(&liEnd);
    return (liEnd.QuadPart - liStart.QuadPart) > qwNativeElapsed;
}
```

### GetTickCount/GetTickCount64

**原理：** 获取系统启动后的毫秒数，精度约15-16ms

**检测代码：**
```c
bool IsDebugged(DWORD dwNativeElapsed) {
    DWORD dwStart = GetTickCount();
    
    // ... 被检测代码 ...
    
    return (GetTickCount() - dwStart) > dwNativeElapsed;
}
```

### timeGetTime

**原理：** Windows多媒体定时器，毫秒级精度

**检测代码：**
```c
bool IsDebugged(DWORD dwNativeElapsed) {
    DWORD dwStart = timeGetTime();
    
    // ... 被检测代码 ...
    
    return (timeGetTime() - dwStart) > dwNativeElapsed;
}
```

## 判断依据

### 时间差阈值判断逻辑

```c
// 典型的时间检测模式
#define TIME_THRESHOLD 1000  // 1秒阈值

DWORD start = GetTickCount();
// 执行关键代码块
FunctionToProtect();
DWORD elapsed = GetTickCount() - start;

if (elapsed > TIME_THRESHOLD) {
    // 执行时间过长，可能正在被单步调试
    ExitProcess(-1);
}
```

### 循环累积检测

```c
// 多次测量减少误报
int detect_debug() {
    int score = 0;
    for (int i = 0; i < 10; i++) {
        DWORD start = GetTickCount();
        // 简单操作
        volatile int x = i * i;
        DWORD elapsed = GetTickCount() - start;
        if (elapsed > 20) score++;
    }
    return score > 5;  // 超过半数检测异常则判定调试
}
```

## 处理思路

### API钩子/返回固定值

```c
// Hook GetTickCount返回固定值
DWORD WINAPI HookedGetTickCount() {
    static DWORD fakeTick = 0x12345678;
    return fakeTick++;  // 递增或返回固定值
}

// Hook QueryPerformanceCounter
BOOL WINAPI HookedQueryPerformanceCounter(LARGE_INTEGER *lpPerformanceCount) {
    static LARGE_INTEGER fake = {0};
    fake.QuadPart += 1000;  // 模拟时间流逝
    lpPerformanceCount->QuadPart = fake.QuadPart;
    return TRUE;
}
```

### ScyllaHide时间钩子

```ini
# 启用时间钩子
HOOK_GetTickCount=1
HOOK_GetTickCount64=1
HOOK_QueryPerformanceCounter=1
HOOK_timeGetTime=1
HOOK_GetLocalTime=1
HOOK_GetSystemTime=1
```

### 虚拟机时间控制

- 使用VMware/VirtualBox的时间同步控制
- 暂停虚拟机时间，单步调试后再恢复
- 使用WinDbg的`.time`命令查看和修改时间

### 内核级RDTSC控制

**CR4.TSD位控制：**
```asm
; 在WinDbg内核模式中
r cr4 = 69d   ; 设置TSD位，使RDTSC产生异常

; 捕获异常0xC0000096 (STATUS_PRIVILEGED_INSTRUCTION)
; 然后模拟RDTSC返回值
```

### Patch策略

```asm
; 方法1: NOP掉RDTSC
; 原代码: rdtsc
; Patch: nop nop (0F 31 -> 90 90)

; 方法2: 固定返回值
mov eax, 0x12345678
xor edx, edx

; 方法3: 跳过时间检查
; 找到比较和跳转，改为NOP或JMP
```

## 常见误区

| 误区 | 正确认识 |
|-----|---------|
| "只需Hook GetTickCount" | 现代样本通常使用多种时间API组合检测 |
| "RDTSC无法Hook" | 可以通过内核驱动或虚拟化层控制 |
| "时间检测只在关键代码前后" | 可能分散在多处，甚至在中断处理中 |
| "固定返回值最安全" | 可能导致程序逻辑异常，应模拟正常时间流逝 |

## 相关工具

| 工具 | 用途 |
|------|------|
| **ScyllaHide** | 自动钩住时间API |
| **WinDbg** | 内核级RDTSC控制 |
| **Cheat Engine** | VEH调试器选项可绕过部分时间检测 |
| **VMware Tools** | 虚拟机时间控制 |

## 识别时间检测点

1. 搜索RDTSC指令 (opcode `0F 31`)
2. 搜索时间相关API导入表
3. 查找连续的两个时间调用之间的代码块

## 参考资源

- [Check Point Anti-Debug Tricks](https://anti-debug.checkpoint.com/)
- ScyllaHide 文档
