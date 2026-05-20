---
id: reversing-control-flow-flattening
title: 控制流平坦化识别与反混淆
category: reversing
tags: [reversing, ctf, control, flow, flattening, authorized-analysis, malware-research]
difficulty: advanced
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 控制流平坦化识别与反混淆

## 摘要

控制流平坦化（Control Flow Flattening）是将代码的嵌套结构转换为`while(1)+switch`状态机结构的混淆技术，广泛用于商业保护器和LLVM混淆器。本文介绍识别特征、还原方法和工具使用。

## 适用场景

- **保护类型**：OLLVM、Hikari、Pluto-Obfuscator、Arkari、o-mvll等LLVM混淆器
- **文件类型**：ELF、PE、Mach-O（编译时混淆）
- **分析目标**：还原原始控制流结构，便于理解程序逻辑
- **不适用条件**：动态生成代码（JIT）、多线程交错执行的平坦化

## 识别信号

### 1. 代码结构特征

**典型模式 - 状态机循环：**
```c
// 混淆后代码结构
while (1) {
    switch (state) {
        case 0:
            // 原始基本块1
            state = 3;  // 下一状态
            break;
        case 1:
            // 原始基本块2
            if (condition)
                state = 5;  // 条件分支1
            else
                state = 7;  // 条件分支2
            break;
        // ... 更多case
        case N:
            goto end;  // 退出
    }
}
end:
```

**IDA/Ghidra识别特征：**
- 单一入口大循环（通常是`while(true)`）
- 循环内包含大型switch语句
- switch变量在case之间传递（状态变量）
- 大量无条件赋值给同一变量
- 原始条件分支转换为状态赋值

### 2. 指令模式（汇编层）

**x86/x64特征：**
```asm
; 状态加载
mov eax, [rbp+state_var]

; switch跳转表
cmp eax, max_state
ja default_case
jmp ds:jpt_xxx[rax*8]

; 状态更新
mov [rbp+state_var], next_state
jmp loop_start

; 条件分支改为状态选择
cmp condition
mov eax, state_if_true
mov ebx, state_if_false
cmovz eax, ebx
mov [rbp+state_var], eax
```

**ARM/AArch64特征：**
```asm
; 加载状态
ldr w0, [sp, state_offset]

; 跳转表
adr x1, jump_table
ldr x2, [x1, w0, sxtw #3]
br x2

; 状态更新
mov w0, #next_state
str w0, [sp, state_offset]
b loop_start
```

### 3. 控制流图（CFG）特征

- **混淆前**：层次化结构，嵌套条件清晰可见
- **混淆后**：星型结构，所有基本块都指向中心分发器

```
混淆前CFG:          混淆后CFG:
    [A]                [Dispatcher]
   /   \              /    |    \
 [B]   [C]          [B]   [C]   [D]
  |     |             \    |    /
 [D]---+             [Dispatcher]
```

## 判断依据

### 确认平坦化的检查清单

- [ ] 存在一个主导所有其他基本块的分发器（Dispatcher）
- [ ] 分发器使用单一变量决定下一个执行的基本块
- [ ] 每个功能块结束时更新该变量（状态）
- [ ] 原始的条件跳转被转换为状态赋值选择
- [ ] 函数序言之后立即进入分发器循环

### 与其他混淆的区分

| 混淆类型 | 与平坦化的区别 |
|---------|--------------|
| 虚拟化保护 | 使用自定义字节码，而非原始指令 |
| 间接跳转 | 单个跳转目标混淆，无状态机结构 |
| 函数内联 | 代码复制，无循环+switch结构 |

## 处理思路

### 方法一：动态跟踪还原（推荐用于复杂案例）

**步骤：**
1. **定位关键变量**：识别存储状态值的变量/寄存器
2. **设置跟踪点**：在每个case开头下断点
3. **记录执行轨迹**：运行程序，记录状态转换序列
4. **重建控制流**：根据轨迹绘制原始CFG

**实现脚本（x64dbg脚本示例）：**
```python
# 动态跟踪状态变量
state_addresses = []
breakpoint_at_dispatcher()

while not program_terminated():
    state = get_state_variable_value()
    current_pc = get_pc()
    state_addresses.append((state, current_pc))
    continue_execution()

# 生成原始控制流
cfg = build_cfg_from_trace(state_addresses)
```

### 方法二：符号执行求解（适用于简单约束）

**使用angr还原：**
```python
import angr
import claripy

p = angr.Project('flattened_binary')

# 定位平坦化函数
func_addr = 0x401000

# 符号执行探索
state = p.factory.blank_state(addr=func_addr)
simgr = p.factory.simgr(state)

# 探索直到函数返回
simgr.explore(find=lambda s: s.addr == func_end)

# 提取路径约束
for path in simgr.found:
    print(f"Path to return: {path.history.bbl_addrs}")
```

### 方法三：使用专业反平坦化工具

#### deflat（IDA Pro插件）

**功能**：自动识别并恢复OLLVM风格控制流平坦化

**安装：**
```bash
# 复制到IDA插件目录
cp deflat.py $IDA_PLUGINS/
```

**使用：**
1. IDA中定位平坦化函数
2. 按`Alt+F`或选择`Edit->Plugins->deflat`
3. 插件自动重建原始控制流
4. 生成新函数或patch原函数

#### REScue（Binary Ninja插件）

**功能**：针对多种平坦化变体的恢复工具

**支持类型**：
- OLLVM经典平坦化
- Hikari变种
- 自定义状态机

#### D810（Ghidra插件）

**功能**：去混淆框架，支持控制流平坦化

**使用流程：**
1. 分析→去混淆→配置D810
2. 选择平坦化恢复模式
3. 应用并等待处理完成

### 方法四：手动Patch还原（适用于简单函数）

**步骤：**
1. 识别所有case块对应的功能
2. 分析状态转换逻辑
3. 用条件跳转替换状态赋值
4. 删除分发器循环

**示例Patch：**
```asm
; 原始平坦化代码
mov eax, [state]
cmp eax, 1
jne next_case
call do_something
mov [state], 3   ; 更新状态
jmp dispatcher

; Patch为：
call do_something
; 根据逻辑直接跳转到目标
jmp target_block
```

## 常见误区

- **误区1**：所有switch结构都是平坦化
  - ✅ 真实情况：编译器优化也会产生跳转表，需结合状态更新模式判断
  
- **误区2**：平坦化只用于保护器
  - ✅ 真实情况：编译器（如Clang优化）也可能产生类似结构
  
- **误区3**：反平坦化后代码与原代码完全一致
  - ✅ 真实情况：变量名、部分表达式可能仍无法恢复
  
- **误区4**：所有平坦化都可以用同一工具处理
  - ✅ 真实情况：自定义实现可能需要针对性分析

## 失败信号与转向条件

- **动态跟踪状态不收敛**：改用符号执行
- **状态变量加密/哈希化**：需要逆向状态计算逻辑
- **多线程状态共享**：增加动态跟踪复杂度，考虑单线程快照
- **间接状态更新**：无法直接定位状态变量，需数据流分析

## 工具与脚本

### 自动反平坦化工具

| 工具 | 平台 | 支持类型 | 链接 |
|-----|------|---------|------|
| deflat | IDA Pro | OLLVM经典 | https://github.com/SukkaW/deflat |
| REScue | Binary Ninja | 多种变体 | https://github.com/ChiChou/REScue |
| D810 | Ghidra | 通用框架 | https://github.com/obama-imd/D810 |
| Mcsema | 跨平台 | LLVM IR级 | https://github.com/lifting-bits/mcsema |

### 辅助分析脚本

**识别状态变量（Ghidra脚本）：**
```python
# find_state_variable.py
# 查找被频繁读写且用于switch条件的变量

def find_state_variable(func):
    switch_vars = []
    for block in func.getBasicBlocks():
        for instr in block.getInstructions():
            # 查找switch/jump table指令
            if instr.getMnemonicString() == "JMP" and "jump" in str(instr.getDefaultOperandRepresentation(0)):
                # 回溯查找索引变量
                var = track_back_to_variable(instr)
                switch_vars.append(var)
    
    # 统计各变量的读写频率
    return analyze_variable_frequency(func, switch_vars)
```

## 记录规范

- **样本 hash**：
- **平台与位数**：x86/x64/ARM
- **混淆器类型**：OLLVM/Hikari/Pluto/自定义
- **状态变量位置**：寄存器/栈偏移
- **Case数量**：

## 参考案例

- `prompts/reverse/` 中涉及LLVM混淆的题目

## 相关专题

- [查表还原技术](./table-lookup-restoration.md) - 处理S-Box等查找表
- [虚拟机保护识别](../packers/vmprotect-virtualization.md) - 区分虚拟化与平坦化

## 参考资源

- OLLVM源码: https://github.com/obfuscator-llvm/obfuscator
- Control Flow Flattening论文: "Obfuscating C++ Programs via Control Flow Flattening"
- Mcsema: https://github.com/lifting-bits/mcsema

## 后续待补

- [ ] LLVM IR级去平坦化方法
- [ ] 多层次嵌套平坦化处理
- [ ] 与虚拟化保护结合的混合分析
