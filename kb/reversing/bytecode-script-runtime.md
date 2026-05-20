---
id: reversing-bytecode-script-runtime
title: 字节码与脚本运行时分析
category: reversing
tags: [reversing, ctf, bytecode, script, runtime, authorized-analysis, malware-research]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 字节码与脚本运行时分析

## 适用场景

- 分析 Lua 字节码文件
- 反编译 Python .pyc 文件
- 逆向 .NET IL 代码
- 还原 JavaScript 混淆代码

## Lua 字节码结构分析

### Lua 字节码文件格式（.luac）

**文件头结构（12字节）：**
```
Offset  Size  Description
0       4     魔数: 0x1B 0x4C 0x75 0x61 (Esc"Lua")
4       1     版本号: 0x51 (Lua 5.1)
5       1     格式版本: 0x00
6       1     字节序标志: 0=大端, 1=小端
7       1     sizeof(int)
8       1     sizeof(size_t)
9       1     sizeof(Instruction)
10      1     sizeof(lua_Number)
11      1     lua_Number是否为整数
```

**函数原型结构：**
- 源文件名
- 起止行号
- 参数数量
- 可变参数标志
- 寄存器数量
- 指令列表（code）
- 常量表（constants）
- 内嵌函数原型列表

### Lua 虚拟机指令集

**常见指令类型：**
| 指令 | 操作码 | 功能 |
|-----|--------|------|
| MOVE | 0x00 | 寄存器间复制 |
| LOADK | 0x01 | 加载常量 |
| LOADBOOL | 0x02 | 加载布尔值 |
| LOADNIL | 0x03 | 加载nil |
| GETUPVAL | 0x04 | 获取upvalue |
| GETGLOBAL | 0x05 | 获取全局变量 |
| GETTABLE | 0x06 | 表索引 |
| SETGLOBAL | 0x07 | 设置全局变量 |
| SETUPVAL | 0x08 | 设置upvalue |
| SETTABLE | 0x09 | 表赋值 |
| NEWTABLE | 0x0A | 创建新表 |
| CALL | 0x1C | 函数调用 |
| RETURN | 0x1E | 返回 |

### 魔改 Lua 分析

IoT设备中常见的Lua魔改类型：
- 修改操作码数值
- 改变数据类型大小
- 自定义头部魔数
- 指令集扩展

**分析步骤：**
1. 对比标准luac头部确定修改点
2. 通过已知源码交叉编译对比
3. 构建自定义解析器转换回标准格式

## Lua 反编译工具

### unluac（Java实现）

**特点：**
- 基于Java，跨平台
- 支持Lua 5.1/5.2/5.3
- 输出可读性较好的Lua源码

**使用方式：**
```bash
java -jar unluac.jar target.luac > output.lua
```

### luadec（C/Rust实现）

**特点：**
- 支持Lua 5.1/5.2/5.3
- 提供反汇编功能（-dis参数）
- 支持函数级反编译（-f参数）

**常用命令：**
```bash
luadec target.luac                    # 反编译
luadec -dis target.luac               # 反汇编
luadec -pn target.luac                # 打印嵌套函数结构
luadec -f 0_1 target.luac             # 反编译指定函数
luadec -fc target.luac                # 指令级对比验证
```

### 处理魔改Lua

```python
# 自定义luac转换示例
def convert_custom_luac(data, custom_sizes, standard_sizes):
    """
    将魔改luac转换为标准格式
    """
    header = parse_custom_header(data, custom_sizes)
    luac = parse_with_custom_types(data, header)
    
    # 转换为标准格式
    standard_header = build_standard_header(standard_sizes)
    return standard_header + rebuild_bytecode(luac)
```

## Python .pyc 文件格式

### .pyc 文件结构

**头部结构：**
- Python 3.7+: 16字节头部
  - 4字节魔数（标识Python版本）
  - 4字节null填充
  - 8字节时间戳/哈希
- 之后是序列化的code对象（marshal格式）

**code对象字段：**
```
co_argcount      # 参数数量
co_nlocals       # 局部变量数
co_stacksize     # 栈大小
co_flags         # 标志位
co_code          # 字节码
co_consts        # 常量元组
co_names         # 名称元组
co_varnames      # 变量名元组
co_filename      # 文件名
co_name          # 函数名
# ... 其他字段
```

### Python 字节码指令

**常见指令示例：**
| 指令 | 字节码 | 功能 |
|-----|--------|------|
| POP_TOP | 1 | 弹出栈顶 |
| ROT_TWO | 2 | 交换栈顶两项 |
| LOAD_CONST | 100 | 加载常量 |
| LOAD_NAME | 101 | 加载名称 |
| STORE_NAME | 90 | 存储名称 |
| BINARY_ADD | 23 | 二进制加法 |
| CALL_FUNCTION | 131 | 函数调用 |
| RETURN_VALUE | 83 | 返回值 |

## Python 反编译工具

### uncompyle6

**版本支持：** Python 2.5 - 3.7

**安装使用：**
```bash
pip install uncompyle6
uncompyle6 -o output_dir target.pyc
```

**Python API调用：**
```python
import uncompyle6

with open('output.py', 'w') as f:
    uncompyle6.decompile_file('target.pyc', f)
```

### decompyle3

**版本支持：** Python 3.7+

**使用方式：**
```bash
pip install decompyle3
decompyle3 target.pyc > output.py
```

### pycdc

**特点：**
- 支持Python 2和3
- 图形界面可用
- 处理混淆代码能力较强

### PyInstaller提取

**工具：** pyinstxtractor

**流程：**
```bash
# 1. 提取pyc文件
python pyinstxtractor.py target.exe

# 2. 修复pyc头部（添加魔术数字和时间戳）

# 3. 反编译
uncompyle6 extracted_file.pyc
```

### 自动化逆向流程

```python
import os
import subprocess

def full_reverse_engineering(exe_path, output_dir):
    """完整的逆向工程流程：提取->修复->反编译"""
    os.makedirs(output_dir, exist_ok=True)
    
    # 提取pyc
    subprocess.run(f"python pyinstxtractor.py {exe_path} -o {output_dir}", shell=True)
    
    # 识别入口点
    extracted_dir = f"{exe_path}_extracted"
    entry_points = []
    for root, _, files in os.walk(extracted_dir):
        for file in files:
            if file.endswith(".pyc") and ("main" in file or "entry" in file):
                entry_points.append(os.path.join(root, file))
    
    # 反编译
    decompile_dir = os.path.join(output_dir, "decompiled")
    os.makedirs(decompile_dir, exist_ok=True)
    
    for pyc_file in entry_points:
        py_file = os.path.splitext(os.path.basename(pyc_file))[0] + ".py"
        subprocess.run(f"uncompyle6 {pyc_file} > {os.path.join(decompile_dir, py_file)}", shell=True)
```

## .NET IL 代码分析

### .NET程序集结构

- **PE格式**：包含.NET元数据的Windows可执行文件
- **IL代码**：中间语言指令（平台无关）
- **元数据**：类型定义、方法签名、字符串等资源

### IL指令集概览

| 指令 | 功能 |
|-----|------|
| nop | 空操作 |
| ldstr | 加载字符串 |
| ldc.i4 | 加载4字节整数 |
| call | 调用方法 |
| callvirt | 虚方法调用 |
| ret | 返回 |
| br.s | 短跳转 |
| ldarg | 加载参数 |
| ldloc | 加载局部变量 |
| stloc | 存储到局部变量 |
| newobj | 创建对象 |

### 主要分析工具

**dnSpy/dnSpyEx：**
- 功能：反编译、调试、编辑程序集
- 特点：集成调试器、支持IL/C#/VB编辑
- 使用场景：恶意软件分析、漏洞研究

**ILSpy：**
- 功能：.NET反编译器
- 特点：跨平台、支持C#/IL输出、PDB生成
- CLI版本：ilspycmd

**de4dot：**
- 功能：去混淆工具
- 支持：多种商业混淆器（Confuser、Dotfuscator等）

### IL分析流程

```bash
# 使用ILSpy CLI反编译
dnx ilspycmd -o ./decompiled MyAssembly.dll

# 反编译特定类型
dnx ilspycmd -t Namespace.ClassName MyAssembly.dll

# 显示IL代码
dnx ilspycmd -il MyAssembly.dll

# 导出为项目
dnx ilspycmd -p -o ./project MyAssembly.dll
```

## JavaScript 混淆还原方法

### 常见混淆类型

| 类型 | 特征 | 还原难度 |
|-----|------|---------|
| 变量名压缩 | 单字母变量名 | 低 |
| 字符串编码 | 十六进制/Unicode编码 | 低 |
| 控制流扁平化 | switch/goto结构 | 中 |
| 死代码插入 | 无用条件分支 | 中 |
| 动态代码执行 | eval/Function构造 | 中 |
| AST混淆 | 复杂语法转换 | 高 |
| 虚拟机保护 | 自定义字节码 | 高 |

### 还原工具链

**格式美化：**
- JSBeautify：代码格式化
- Prettier：规范化输出

**反混淆工具：**
| 工具 | 针对类型 |
|-----|---------|
| **javascript-deobfuscator** | 通用反混淆 |
| **obfuscator-io-deobfuscator** | obfuscator.io特定 |
| **synchrony** | javascript-obfuscator专用 |
| **webcrack** | Webpack打包还原 |
| **wakaru** | 模块化还原 |

### AST-based 反混淆

```javascript
// 使用Babel进行反混淆示例
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const types = require("@babel/types");

function deobfuscate(code) {
    const ast = parser.parse(code);
    
    traverse(ast, {
        // 还原字符串数组混淆
        StringLiteral(path) {
            // 处理编码字符串
        },
        // 还原控制流扁平化
        SwitchStatement(path) {
            // 分析并还原顺序
        }
    });
    
    return generate(ast).code;
}
```

## 自定义虚拟机指令集逆向

### VM保护原理

**基本架构：**
```
原始代码 (x86/ARM) 
    ↓
VM编译器
    ↓
自定义字节码 (VM Bytecode)
    ↓
VM解释器/执行引擎
    ↓
原始机器码执行
```

**关键组件：**
- 指令解码器（Dispatcher）
- 虚拟寄存器/栈
- 内存管理
- 指令处理器（Handler）

### VM逆向分析步骤

**第一阶段：识别VM**
```
1. 发现VM循环结构（大switch或handler表）
2. 识别虚拟寄存器和虚拟栈
3. 定位字节码存储位置
```

**第二阶段：提取字节码**
```
1. 确定字节码加载位置
2. 分析指令编码格式（定长/变长）
3. 提取完整字节码流
```

**第三阶段：Handler分析**
```
1. 识别每个opcode对应的handler
2. 提取handler语义（等效x86指令）
3. 构建指令映射表
```

**第四阶段：反汇编/反编译**
```
1. 编写自定义disassembler
2. 将VM指令翻译为中间表示（IR）
3. 优化并生成伪代码
```

### VM分析工具

| 工具 | 功能 |
|-----|------|
| **IDA Processor Modules** | 自定义指令集反汇编 |
| **Binary Ninja Architecture Plugins** | 架构插件开发 |
| **x86devirt** | x86虚拟化还原 |
| **VMHunt** | 自动化VM分析 |
| **Triton** | 符号执行框架 |

## 相关工具汇总

| 工具 | 地址 |
|-----|------|
| unluac | https://github.com/vrolijk/unluac |
| luadec | https://github.com/viruscamp/luadec |
| uncompyle6 | https://github.com/rocky/python-uncompyle6 |
| decompyle3 | https://github.com/rocky/python-decompile3 |
| pycdc | https://github.com/zrax/pycdc |
| dnSpy | https://github.com/dnspy/dnspy |
| ILSpy | https://github.com/icsharpcode/ILSpy |
| de4dot | https://github.com/de4dot/de4dot |
| webcrack | https://github.com/j4k0xb/webcrack |

## 参考案例

- `prompts/reverse/luac_challenge/`（Lua 字节码挑战）

## 参考资源

- Lua 5.1 VM Instructions: Kein-Hong Man's "A No-Frills Introduction to Lua 5.1 VM Instructions"
- Python dis模块文档: https://docs.python.org/3/library/dis.html
- ECMA-335 (.NET CLI标准): https://www.ecma-international.org/publications/standards/Ecma-335.htm
