---
id: reversing-symbolic-execution
title: 符号执行入门
category: reversing
tags: [reversing, ctf, symbolic, execution, authorized-analysis, malware-research]
difficulty: advanced
status: review
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 符号执行入门

## 摘要

符号执行（Symbolic Execution）是一种程序分析技术，使用符号值代替具体输入执行程序，自动探索程序路径并生成约束条件。本文介绍angr和Z3的基础使用，适用于CTF逆向和漏洞分析。

## 适用场景

- **保护类型**：序列号验证、迷宫求解、约束检查、加密算法验证
- **文件类型**：ELF、PE、Mach-O（支持二进制符号执行）
- **分析目标**：自动求解验证逻辑、路径探索、约束求解
- **不适用条件**：复杂状态机、加密哈希（如SHA256）、浮点运算密集

## 识别信号

### 适合符号执行的场景

**1. 分支条件明确的验证函数：**
```c
int check_serial(char* input) {
    if (strlen(input) != 16) return 0;
    if (input[0] + input[1] != 155) return 0;
    if (input[2] * input[3] != 5600) return 0;
    // ... 更多约束
    return 1;
}
```

**2. 迷宫/网格路径验证：**
```c
int solve_maze(char* moves) {
    int x = 0, y = 0;
    for (int i = 0; moves[i]; i++) {
        switch (moves[i]) {
            case 'w': y--; break;
            case 's': y++; break;
            case 'a': x--; break;
            case 'd': x++; break;
        }
        if (maze[y][x] == '#') return 0;  // 撞墙
    }
    return (x == target_x && y == target_y);
}
```

**3. 线性约束求解（FLARE-ON常见）：**
```c
// 大量整数运算后的比较
if (a * 3 + b * 7 - c * 2 == 0x1234)
if (d * 5 - e * 3 + f == 0x5678)
// ...
```

### 不适合的场景

- **循环次数依赖输入值**：可能导致路径爆炸
- **复杂浮点运算**：符号执行引擎支持有限
- **外部调用密集**：文件/网络操作难以符号化
- **自修改代码**：动态生成代码难以静态分析

## 判断依据

### 检查清单（是否适合符号执行）

- [ ] 目标函数输入为固定长度缓冲区或字符串
- [ ] 验证逻辑基于整数/字节运算和比较
- [ ] 分支条件可表示为线性或位运算约束
- [ ] 无复杂加密算法（AES/SHA/RSA）
- [ ] 循环边界已知或有限
- [ ] 执行路径数量可管理（<10000条）

### 路径爆炸风险评估

```
低风险：
- 线性验证链（顺序检查）
- 固定迭代次数循环
- 条件独立（互不影响）

高风险：
- 嵌套循环
- 输入依赖循环边界
- 条件相互依赖（组合爆炸）
```

## 处理思路

### 一、Z3 SMT Solver 基础

**安装：**
```bash
pip install z3-solver
```

**基础求解示例：**
```python
from z3 import *

# 创建符号变量
x = Int('x')
y = Int('y')

# 创建求解器
s = Solver()

# 添加约束
s.add(x > 0)
s.add(y > 0)
s.add(x + y == 10)
s.add(x * 2 == y)

# 求解
if s.check() == sat:
    m = s.model()
    print(f"x = {m[x]}, y = {m[y]}")  # x = 3, y = 7
else:
    print("无解")
```

**位向量求解（CTF常用）：**
```python
from z3 import *

# 16字节输入作为位向量
flag = [BitVec(f'f{i}', 8) for i in range(16)]

s = Solver()

# 可打印字符约束
for c in flag:
    s.add(c >= 0x20)
    s.add(c <= 0x7e)

# 添加验证逻辑约束
s.add(flag[0] + flag[1] == ord('F') + ord('L'))
s.add(flag[2] ^ flag[3] == 0x13)
# ... 更多约束

if s.check() == sat:
    m = s.model()
    result = ''.join([chr(m[flag[i]].as_long()) for i in range(16)])
    print(f"Flag: {result}")
```

**求解优化标志：**
```python
set_option(max_args=1000000)      # 最大参数数
set_option(max_lines=1000)        # 最大输出行
set_option(timeout=60000)         # 超时60秒
```

### 二、angr 二进制符号执行

**安装：**
```bash
pip install angr
```

**基础使用：**
```python
import angr
import claripy

# 加载程序
p = angr.Project('./target', auto_load_libs=False)

# 创建符号变量（输入）
flag_len = 32
flag = claripy.BVS('flag', flag_len * 8)

# 创建初始状态
state = p.factory.entry_state(stdin=flag)

# 添加约束（可打印字符）
for i in range(flag_len):
    state.solver.add(flag.get_byte(i) >= 0x20)
    state.solver.add(flag.get_byte(i) <= 0x7e)

# 创建模拟管理器
simgr = p.factory.simgr(state)

# 探索路径
# 方式1：探索到目标地址
target_addr = 0x401234  # 成功分支地址
avoid_addr = 0x401300   # 失败分支地址
simgr.explore(find=target_addr, avoid=avoid_addr)

# 方式2：使用条件函数
def is_successful(state):
    return b"Success" in state.posix.dumps(1)

def should_avoid(state):
    return b"Fail" in state.posix.dumps(1)

simgr.explore(find=is_successful, avoid=should_avoid)

# 获取结果
if simgr.found:
    found_state = simgr.found[0]
    solution = found_state.solver.eval(flag, cast_to=bytes)
    print(f"Solution: {solution}")
```

**hook函数替换：**
```python
# 跳过复杂/无关函数
@p.hook(0x401000)
def skip_func(state):
    state.regs.rax = 0  # 设置返回值
    state.regs.rip = state.stack_pop()  # 返回

# 或者使用simprocedure
class MyFunc(angr.SimProcedure):
    def run(self, arg1, arg2):
        return 0  # 简单返回值

p.hook_symbol('complex_func', MyFunc())
```

**约束求解示例：**
```python
# 当需要手动添加约束时
state.solver.add(state.regs.rax == 0xdeadbeef)
state.solver.add(state.mem[0x404000].int.resolved == 100)

# 检查可满足性
if state.satisfiable():
    solution = state.solver.eval(flag, cast_to=bytes)
```

### 三、实际应用场景

#### 场景1：序列号求解

```python
import angr
import claripy

p = angr.Project('./serial_check', auto_load_libs=False)

# 创建符号输入（20字符）
serial = claripy.BVS('serial', 20 * 8)

# 从main开始
state = p.factory.call_state(0x401200, serial)

# 探索到成功地址
simgr = p.factory.simgr(state)
simgr.explore(find=0x401350, avoid=0x401380)

if simgr.found:
    sol = simgr.found[0].solver.eval(serial, cast_to=bytes)
    print(f"Serial: {sol}")
```

#### 场景2：迷宫求解

```python
import angr

p = angr.Project('./maze', auto_load_libs=False)

# 符号化移动序列（最多50步）
moves = claripy.BVS('moves', 50 * 8)
state = p.factory.entry_state(stdin=moves)

# 限制字符集（wasd）
for i in range(50):
    byte = moves.get_byte(i)
    state.solver.add(
        claripy.Or(
            byte == ord('w'),
            byte == ord('a'),
            byte == ord('s'),
            byte == ord('d'),
            byte == 0  # 结束符
        )
    )

# 探索到终点
simgr = p.factory.simgr(state)
simgr.explore(find=lambda s: b"You win" in s.posix.dumps(1))

if simgr.found:
    path = simgr.found[0].solver.eval(moves, cast_to=bytes)
    print(f"Path: {path.rstrip(b'\\x00')}")
```

#### 场景3：约束提取 + Z3求解

```python
# 当angr路径爆炸时，手动提取约束
import angr
from z3 import *

p = angr.Project('./constraints', auto_load_libs=False)

# 跟踪到约束检查点
state = p.factory.entry_state()
simgr = p.factory.simgr(state)

# 执行到检查函数入口
simgr.explore(find=0x401500)

if simgr.found:
    s = simgr.found[0]
    
    # 提取内存中的约束
    constraints = []
    for i in range(16):
        val = s.mem[0x404000 + i].byte.resolved
        constraints.append(val)
    
    # 使用Z3求解
    flag = [BitVec(f'f{i}', 8) for i in range(16)]
    solver = Solver()
    
    # 根据约束构建方程
    solver.add(flag[0] + flag[1] == constraints[0])
    # ...
    
    if solver.check() == sat:
        m = solver.model()
        print(''.join([chr(m[flag[i]].as_long()) for i in range(16)]))
```

### 四、处理路径爆炸

**1. 使用Veritesting：**
```python
# 合并相似路径
simgr = p.factory.simgr(state, veritesting=True)
```

**2. 设置路径限制：**
```python
# 限制活跃状态数
simgr = p.factory.simgr(state)
simgr.use_technique(angr.exploration_techniques.LoopSeer(bound=10))
```

**3. 手动剪枝：**
```python
def step_func(simgr):
    # 丢弃过多状态
    if len(simgr.active) > 50:
        # 保留最"深"的状态
        simgr.active = sorted(simgr.active, 
                             key=lambda s: s.callstack.depth)[-50:]
    return simgr

simgr.step(step_func=step_func)
```

**4. 使用DFS代替BFS：**
```python
from angr.exploration_techniques import DFS

simgr = p.factory.simgr(state)
simgr.use_technique(DFS())
```

## 常见误区

- **误区1**：符号执行可以自动解决所有问题
  - ✅ 真实情况：复杂问题需要结合手动分析
  
- **误区2**：路径越多越应该使用符号执行
  - ✅ 真实情况：路径爆炸是主要限制，需评估可行性
  
- **误区3**：Z3总能快速求解
  - ✅ 真实情况：复杂位运算/非线性约束可能很慢或超时
  
- **误区4**：angr加载libs越全越好
  - ✅ 真实情况：通常设置`auto_load_libs=False`避免干扰

## 失败信号与转向条件

- **状态数指数增长**：使用veritesting或手动hook简化
- **求解超时**：尝试缩小输入范围或分段求解
- **内存不足**：限制活跃状态数，使用DFS
- **复杂浮点运算**：改用动态分析或近似求解

## 工具与脚本

### 核心工具

| 工具 | 功能 | 安装 |
|-----|------|------|
| Z3 | SMT求解器 | `pip install z3-solver` |
| angr | 二进制符号执行 | `pip install angr` |
| manticore | 智能合约/二进制符号执行 | `pip install manticore` |
| Triton | 动态符号执行 | 源码编译 |

### 辅助脚本

**自动求解模板：**
```python
#!/usr/bin/env python3
"""CTF自动求解模板"""
import angr
import claripy
import sys

def solve_binary(binary_path, flag_len=32, target_str=b"flag", avoid_str=b"wrong"):
    p = angr.Project(binary_path, auto_load_libs=False)
    
    # 创建符号输入
    flag = claripy.BVS('flag', flag_len * 8)
    
    # 创建入口状态
    state = p.factory.entry_state(stdin=flag)
    
    # 添加可打印字符约束
    for i in range(flag_len):
        b = flag.get_byte(i)
        state.solver.add(b >= 0x20)
        state.solver.add(b <= 0x7e)
    
    # 探索
    simgr = p.factory.simgr(state)
    simgr.explore(
        find=lambda s: target_str in s.posix.dumps(1),
        avoid=lambda s: avoid_str in s.posix.dumps(1)
    )
    
    if simgr.found:
        sol = simgr.found[0].solver.eval(flag, cast_to=bytes)
        return sol.decode('latin-1')
    return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <binary>")
        sys.exit(1)
    
    result = solve_binary(sys.argv[1])
    if result:
        print(f"Solution: {result}")
    else:
        print("No solution found")
```

## 记录规范

- **样本 hash**：
- **符号执行引擎**：angr/Z3/manticore
- **输入长度**：
- **约束类型**：线性/位运算/非线性
- **求解时间**：
- **路径数量**：

## 参考案例

- FLARE-ON 2024 多道题目使用Z3求解
- `prompts/reverse/re2/` - 线性约束求解

## 相关专题

- [线性约束校验器识别与求解](./linear-constraint-checkers.md) - 特定约束模式
- [内嵌数据结构提取与离线求解](./embedded-structure-extraction.md) - 迷宫等结构
- [查表还原技术](./table-lookup-restoration.md) - S-Box等查找表

## 参考资源

- angr文档: https://docs.angr.io/
- Z3指南: https://ericpony.github.io/z3py-tutorial/guide-examples.htm
- "Symbolic Execution for Software Testing" (Cadar & Sen, 2013)
- "The angr Binary Analysis Platform" (Shoshitaishvili et al., 2016)

## 后续待补

- [ ] Triton动态符号执行
- [ ] 污点分析应用
- [ ] 混合执行（Concolic Execution）
- [ ] 智能合约符号执行
