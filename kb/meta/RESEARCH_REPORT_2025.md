---
id: meta-research-report-2025
title: 逆向工程知识库专题研究报告
category: meta
tags: [meta, ctf, research, report, 2025]
difficulty: intermediate
status: review
last_reviewed: 2026-05-10
applies_to: [repository-maintenance]
risk_level: benign
---
# 逆向工程知识库专题研究报告

## 摘要

本报告基于对知识库中 reversing/ 目录现有内容的分析，结合 2024-2025 年互联网最新研究成果，提供关于字符串混淆、约束求解、数据结构提取、查表还原、字节码分析和加密算法识别等领域的最新技术动态和知识库更新建议。

---

## 一、当前知识库内容摘要

### 1.1 已有专题覆盖

| 专题 | 文件 | 主要内容 | 完成度 |
|------|------|----------|--------|
| 字符串混淆模式 | string-obfuscation-patterns.md | 运行时拼接、异或/加减/查表编码的识别与恢复 | ✅ 基础覆盖 |
| 线性约束校验器 | linear-constraint-checkers.md | Z3求解、方程组式验证逻辑识别 | ✅ 基础覆盖 |
| 内嵌数据结构提取 | embedded-structure-extraction.md | 迷宫、网格等结构提取与离线求解 | ✅ 基础覆盖 |
| 查表还原技术 | table-lookup-restoration.md | S-Box识别（AES/DES/Blowfish）、T-Table、常量表恢复 | ✅ 较完整 |
| 字节码与脚本分析 | bytecode-script-runtime.md | Lua/Python/.NET/JS 反编译与VM分析 | ✅ 较完整 |

### 1.2 现有工具链覆盖

**静态分析**: IDA Pro, Ghidra, radare2, Binary Ninja
**动态分析**: x64dbg, WinDbg, Frida
**Python反编译**: uncompyle6, decompyle3, pycdc
**Lua反编译**: unluac, luadec
**.NET反编译**: dnSpy, ILSpy, de4dot
**求解器**: Z3 SMT Solver

### 1.3 现有案例覆盖

- Project1 自定义 AES 案例
- monster_invasion Caesar+Base64 案例
- peek_stack XOR 解密案例
- re2 线性约束案例
- Maze 迷宫案例
- re_sudoku 数独案例

---

## 二、互联网搜索发现的补充内容

### 2.1 字符串混淆和去混淆的最新技术 (2024-2025)

#### 2.1.1 新兴混淆技术分类

根据最新研究，字符串混淆技术可分为四个主要层级：

**词法级混淆 (Lexical-level)**:
- 标识符重命名：替换为有意义的随机字符串
- 间接属性访问：`console.log` → `console['\x6c\x6f\x67']`
- 算术化：将简单数字替换为复杂表达式（如 `683517 ^ 683398` 代替 `123`）
- 字符串编码：Base64、Unicode 编码
- 布尔编码：`!![]` 代替 `true`

**句法级混淆 (Syntactic-level)**:
- 赋值转函数表达式包装
- 字符串反转存储（split/reverse/join 还原）
- AAEncode：使用特殊 Unicode 字符编码
- IJEncode：利用 JavaScript 类型强制
- JSFUCK：仅用 `[]()!+` 六个字符表示任意代码

**控制流混淆**:
- 控制流扁平化：switch/goto 结构
- 死代码插入：无用条件分支
- 动态代码执行：eval/Function 构造

**虚拟机保护 (VM Protection)**:
- 自定义字节码
- 解释器/执行引擎保护

#### 2.1.2 反混淆对抗措施

研究发现 21 种独特的字符串混淆技术，主流商业混淆器（DexGuard、Allatori、DashO、Stringer、ZKM）采用以下对抗策略：

| 对抗措施 | 描述 |
|----------|------|
| 序列化对象 (SO) | 运行时加载实现去混淆方法的序列化对象 |
| 静态初始化器 (SI) | 在静态初始化器中计算去混淆密钥 |
| 字节数组 (BA) | 使用字节数组隐藏混淆字符串表示 |
| Switch 语句 (SW) | 在循环中使用 switch 语句逐轮去混淆 |
| 栈调用 (SC) | 硬编码调用上下文作为去混淆密钥的一部分 |

#### 2.1.3 ML辅助反混淆

- **自动化检测**: 结合静态分析启发式与统计特征排名
- **LLM辅助**: 使用大语言模型重构解码器逻辑或从反汇编片段恢复明文
- **约束求解**: 将二进制转换为中间表示(IR)，通过SMT求解器求解语义等价约束

### 2.2 线性约束校验器（Z3求解）的最新应用

#### 2.2.1 LLM赋能的符号执行

2024年重要进展：**LLM-Sym** 框架

- 基于Agent的符号执行框架，使用LLM将路径转换为Z3可求解的约束
- 解决动态类型语言（如Python）难以转换为刚性求解器的问题
- 核心贡献：复杂Python路径约束到Z3代码的翻译
- 多步代码生成管道：类型推断、检索、自细化

#### 2.2.2 符号执行技术演进

| 技术 | 特点 | 应用 |
|------|------|------|
| 传统SMT求解 | Z3、STP等求解器 | 位向量、数组理论 |
| Concolic执行 | 用具体值简化复杂路径条件 | JDart、JCUTE |
| 混合求解 | 求解简单部分，用解作为复杂部分的具体值 | SPF-Mixed |
| ML引导 | 机器学习指导求解器收敛 | MLBSE框架 |

#### 2.2.3 Z3str扩展

- Z3-str扩展支持字符串作为原始类型
- 支持常见字符串操作：连接、子串、替换
- 被MAYHEM、SAGE、ANGR等符号执行器采用

### 2.3 内嵌数据结构提取技巧

#### 2.3.1 嵌入式系统数据提取

**固件提取流程**:
1. 通过JTAG等接口直接读取二进制
2. 使用Binwalk识别和提取嵌入式文件系统
3. 定位二进制blob中的代码或数据

**机器学习辅助**:
- 语义分割技术应用于IC图像分析
- 监督学习用于识别标准单元
- 迁移学习（Meta's SAM在IC图像上的微调）
- 无监督学习用于伪标签生成

#### 2.3.2 硬件逆向工程数据提取

**FPGA比特流分析**:
- Project X-Ray用于比特流到网表转换
- HAL框架用于网表逆向工程
- SMT求解用于功能网表分析

**芯片级分析**:
- 芯片开封与层析成像
- 电子显微镜和X射线断层扫描
- 电路提取与网表重建

### 2.4 查表还原技术（S-Box等）的最新进展

#### 2.4.1 动态S-Box技术

2025年研究热点：**动态AES方案**

- 每轮使用动态生成的S-Box替代固定S-Box
- 基于扰动因子的动态密钥扩展
- 在嵌入式平台（STM32F407）上的实现验证
- 优点：增强不可逆性和不可预测性

**动态S-Box性能对比**:
| 指标 | 标准AES S-Box | 动态S-Box |
|------|---------------|-----------|
| 差分均匀性 | 4 | 4 |
| 非线性度 | 112 | 112 |
| SAC距离（绝对偏差） | 432 | 304 |

#### 2.4.2 S-Box硬件实现调查

2025年ACM全面调查涵盖了20年研究：

**实现类型**:
- 完整查找表（Full LUT）：256字节ROM
- 逆元查找表：仅存储GF(2^8)乘法逆元
- 基于门的实现：组合逻辑电路

**白盒密码学中的S-Box**:
- 查找表组合攻击（BGE攻击）
- 差分计算分析（DCA）
- 差分故障分析（DFA）
- Dark Phoenix工具：针对带外部编码的AES白盒实现

#### 2.4.3 S-Box识别技术

**自动化识别**:
- REPQC算法：在PQC硬件加速器中识别Keccak哈希操作
- 数据路径分析定位密码学算法
- SMT求解验证逆向工程结果

### 2.5 字节码分析的最新工具和方法

#### 2.5.1 Python反编译新工具：PyLingual

**核心创新 (BlackHat USA 2024 / IEEE S&P 2025)**:

- 首个集成NLP组件的Python反编译框架
- 采用"完美反编译"标准：指令级等价性严格验证
- 支持Python 3.6-3.12，平均完美反编译率77%
- 相比SOTA工具平均提升47%

**技术架构**:
1. **字节码分割**: 使用NLP模型识别语句边界
2. **语句翻译**: 基于 confidence-guided 的局部搜索
3. **控制流重建**: 构建控制依赖图(CDG)恢复缩进层级

**可用资源**:
- 在线服务: https://pylingual.io/
- GitHub开源: https://github.com/syssec-utd/pylingual

#### 2.5.2 反编译工具现状

| 工具 | 支持版本 | 状态 | 特点 |
|------|----------|------|------|
| uncompyle6 | 2.5-3.7 | 维护中 | 广泛使用，Earley解析器 |
| decompyle3 | 3.7-3.8 | 维护中 | uncompyle6分支，专注3.7+ |
| pycdc | 2.x-3.x | 有限维护 | C++实现，较小体积 |
| PyLingual | 3.6-3.12 | 活跃(2025) | ML驱动，完美反编译验证 |

#### 2.5.3 .NET与Java生态

- **ILSpy**: 持续更新，跨平台，支持ReadyToRun
- **dnSpyEx**: dnSpy的非官方复活版
- **Recaf**: 现代Java字节码编辑器
- **Jadx**: 最强Android反编译器，支持恶意行为检测

### 2.6 加密算法识别和破解的最新技巧

#### 2.6.1 机器学习驱动的算法识别

**GCAIBCF方案** (2025):
- 基于密文特征的通用加密算法识别
- 随机性测试 + 特征提取 + 机器学习分类
- 无需直接访问加密设备或软件
- 非侵入式方法，降低对业务的影响

**特征提取维度**:
- 统计关系
- 熵度量
- N-gram分析
- 随机性测试

#### 2.6.2 黑盒ECC逆向工程

**pyecsca工具包** (CHES 2024最佳工件奖):

- 自动化逆向工程黑盒ECC实现
- 恢复实现配置而非私钥
- 识别标量乘法算法、坐标系统、加法公式
- 绕过坐标和曲线随机化防护措施

**攻击方法**:
- 侧信道分析
- 实现选择空间的组合分析
- 噪声影响研究

#### 2.6.3 白盒密码学攻击进展

**攻击技术演进**:

| 年份 | 攻击类型 | 描述 |
|------|----------|------|
| 2004 | BGE攻击 | 代数分析，合并查找表 |
| 2019 | DCA攻击 | 差分计算分析，捕获内存信息痕迹 |
| 2023 | Dark Phoenix | 针对外部编码的DFA攻击 |

**防护方案**:
- 线性布尔掩码（防DCA）
- 非线性掩码 + 布尔掩码
- 空间硬度概念（弱/强空间硬度）

#### 2.6.4 后量子密码学(PQC)逆向

**REPQC算法** (AsiaCCS 2024):
- 识别PQC硬件加速器中的哈希操作（Keccak）
- 自动化逆向工程
- 硬件木马插入（仅增加0.1%布局密度）

---

## 三、建议添加到知识库的新知识点

### 3.1 新增专题建议

#### 专题1：ML辅助逆向工程技术

```markdown
# ML辅助逆向工程技术

## 内容大纲
1. 机器学习在字符串反混淆中的应用
   - 启发式特征提取
   - 统计指纹分析
   - CNN分类加密例程

2. LLM赋能的逆向工程
   - LLM-Sym框架原理
   - 从反汇编片段重构逻辑
   - 自动化约束生成

3. 实际工具
   - PyLingual的使用
   - StringHound方法论
   - 自动化反混淆管道

## 优先级：高
## 参考资源：
- PyLingual论文 (IEEE S&P 2025)
- StringHound研究
- Dark Phoenix工具
```

#### 专题2：白盒密码学分析与防护

```markdown
# 白盒密码学分析与防护

## 内容大纲
1. 白盒密码学基础
   - 威胁模型（白盒vs黑盒）
   - 查找表混淆技术
   - 外部编码概念

2. 攻击技术
   - BGE代数攻击
   - DCA差分计算分析
   - DFA差分故障分析
   - Dark Phoenix使用方法

3. 防护方案
   - 空间硬度概念
   - 布尔掩码技术
   - 动态S-Box方案

## 优先级：高
## 参考资源：
- BGE攻击论文 (2004)
- DCA攻击论文 (2019)
- Dark Phoenix博客 (Quarkslab 2023)
```

#### 专题3：固件与嵌入式系统逆向

```markdown
# 固件与嵌入式系统逆向

## 内容大纲
1. 固件提取技术
   - JTAG/SWD接口利用
   - 故障注入绕过读保护
   - Binwalk高级用法

2. FPGA逆向工程
   - 比特流格式分析
   - Project X-Ray使用
   - HAL框架入门

3. 硬件辅助分析
   - 侧信道分析基础
   - 功耗分析入门
   - 故障注入技术

## 优先级：中
## 参考资源：
- FPGA Reverse Engineering训练 (Hardwear.io 2024)
- pyecsca文档
```

#### 专题4：现代Python反编译实战

```markdown
# 现代Python反编译实战

## 内容大纲
1. Python字节码演进
   - 3.9+版本新特性
   - 字节码结构变化
   - 常见混淆技术

2. PyLingual深度使用
   - 在线服务使用
   - 本地部署指南
   - 结果修正技巧

3. 复杂案例处理
   - PyInstaller打包程序
   - 混淆Python字节码
   - Cython扩展分析

## 优先级：高
## 参考资源：
- PyLingual文档
- BlackHat USA 2024演讲
```

#### 专题5：加密算法自动化识别

```markdown
# 加密算法自动化识别

## 内容大纲
1. 基于密文的识别
   - 随机性测试套件
   - 统计特征提取
   - 机器学习分类器

2. 基于代码的识别
   - 常量特征匹配
   - 控制流模式识别
   - 数据流分析

3. 黑盒分析技术
   - 输入输出行为分析
   - 侧信道泄露分析
   - 时序特征识别

## 优先级：中
## 参考资源：
- GCAIBCF论文 (2025)
- Signsrch工具
- KryptoAnalyzer
```

### 3.2 新增工具条目建议

| 工具名称 | 类型 | 描述 | 优先级 |
|----------|------|------|--------|
| PyLingual | Python反编译 | ML驱动的完美反编译框架 | 高 |
| Dark Phoenix | 白盒分析 | 针对外部编码的DFA攻击工具 | 高 |
| pyecsca | ECC分析 | 黑盒ECC实现逆向工具包 | 中 |
| StringHound | 字符串分析 | 自动化字符串反混淆 | 中 |
| SEEAD | 反混淆 | 动态污点分析引导的反混淆 | 中 |
| synchrony | JS反混淆 | javascript-obfuscator专用 | 中 |
| webcrack | JS分析 | Webpack打包还原 | 中 |

### 3.3 新增案例研究建议

| 案例名称 | 主题 | 来源 | 优先级 |
|----------|------|------|--------|
| PyLingual实战 | Python反编译 | 公开数据集 | 高 |
| 白盒AES攻击 | 白盒密码学 | NoSuchCon 2013 | 高 |
| FPGA密码学分析 | 硬件逆向 | Hackaday项目 | 中 |
| 动态S-Box提取 | 查表还原 | 2025论文实现 | 中 |
| 混淆JavaScript还原 | 字符串反混淆 | CTF题目 | 中 |

---

## 四、建议更新的现有条目

### 4.1 string-obfuscation-patterns.md 更新建议

#### 新增内容：

```markdown
## 现代JavaScript混淆技术

### 词法级混淆
| 技术 | 示例 | 识别方法 |
|------|------|----------|
| 算术化 | `683517 ^ 683398` → `123` | 大量常量异或运算 |
| 布尔编码 | `!![]` → `true` | 特殊布尔构造模式 |
| 间接访问 | `console['\x6c\x6f\x67']` | 方括号属性访问 |

### 句法级混淆
| 技术 | 特征 | 还原策略 |
|------|------|----------|
| AAEncode | 特殊Unicode字符 | Unicode解码 |
| IJEncode | 类型强制利用 | 表达式求值 |
| JSFUCK | 仅6字符 `[]()!+` | 专用解码器 |

### 反混淆工具更新
- **synchrony**: javascript-obfuscator专用
- **webcrack**: Webpack打包还原
- **wakaru**: 模块化还原
- **javascript-deobfuscator**: 通用反混淆
- **obfuscator-io-deobfuscator**: obfuscator.io特定

## ML辅助反混淆

### StringHound方法论
1. 识别21种独特混淆技术
2. 使用污点分析跟踪字符串流
3. 切片提取去混淆逻辑
4. 自动化执行恢复

### 自动化检测流程
1. 启发式识别潜在解码函数
2. 统计特征验证
3. 微执行确认
4. 结果输出
```

### 4.2 linear-constraint-checkers.md 更新建议

#### 新增内容：

```markdown
## LLM赋能的约束求解

### LLM-Sym框架
- **核心思想**: 使用LLM将Python约束翻译为Z3代码
- **优势**: 支持复杂数据类型（如list）
- **流程**: 类型推断 → 检索 → 自细化

### 神经符号AI方法
- Logic-LM: 结合LLM与符号求解器
- 支持Prolog、FOL、CSP、SAT求解
- 使用Z3进行SMT求解

### 符号执行工具链更新
| 工具 | 特点 | 适用场景 |
|------|------|----------|
| angr | 二进制分析框架 | 固件分析 |
| KLEE | LLVM字节码 | 程序验证 |
| Triton | 动态二进制分析 | 漏洞研究 |
| PANDA | 全系统模拟 | 恶意软件分析 |

## 复杂约束处理策略

### 非线性约束
1. **简化策略**: Concolic执行，用具体值替代
2. **线性包络**: 用线性约束逼近非线性约束
3. **ML引导**: 机器学习指导求解器收敛

### 路径爆炸缓解
- 约束缓存
- 求解器查询延迟
- 具体化策略
```

### 4.3 bytecode-script-runtime.md 更新建议

#### 新增内容：

```markdown
## Python反编译：PyLingual

### 简介
PyLingual是首个集成NLP组件的Python反编译框架，发表于IEEE S&P 2025。

### 核心特性
- **完美反编译**: 指令级等价性验证
- **版本支持**: Python 3.6 - 3.12
- **成功率**: 平均77%完美反编译率
- **提升**: 相比SOTA工具提升47%

### 使用方法
**在线服务**:
```
https://pylingual.io/
```

**本地部署**:
```bash
git clone https://github.com/syssec-utd/pylingual
```

### 技术架构
1. **字节码分割**: NLP模型识别语句边界
2. **语句翻译**: Confidence-guided局部搜索
3. **控制流重建**: CDG构建恢复缩进层级

### 处理混淆代码
- 自动验证反编译正确性
- Web IDE支持手动修正
- 差分测试验证等价性

## 工具更新状态 (2025)

| 工具 | 状态 | 推荐版本 |
|------|------|----------|
| uncompyle6 | 维护中 | Python 2.5-3.7 |
| decompyle3 | 维护中 | Python 3.7-3.8 |
| pycdc | 有限维护 | 通用 |
| PyLingual | 活跃开发 | Python 3.6-3.12 ✅ |

## JavaScript反混淆更新

### 新兴工具
- **synchrony**: 专门针对javascript-obfuscator
- **webcrack**: Webpack打包还原
- **wakaru**: 模块化代码还原

### AST-based技术进展
- Babel生态持续完善
- 控制流扁平化还原更成熟
- 字符串数组混淆自动处理
```

### 4.4 table-lookup-restoration.md 更新建议

#### 新增内容：

```markdown
## 动态S-Box技术

### 概念
动态S-Box在每轮加密中使用不同的替换表，增强安全性。

### 2025年研究进展
**动态AES方案**:
- 每轮使用动态生成的S-Box
- 基于扰动因子的密钥扩展
- STM32F407平台验证通过

**性能对比**:
| 指标 | 标准AES | 动态AES |
|------|---------|---------|
| 差分均匀性 | 4 | 4 |
| 非线性度 | 112 | 112 |
| SAC距离 | 432 | 304 (更优) |

## 白盒密码学中的查表分析

### 白盒AES结构
- 查找表网络保护密钥
- 输入输出编码混淆
- 外部编码概念

### 攻击技术

#### BGE攻击 (2004)
- 合并查找表
- 代数方法求解仿射变换
- 从输出编码推导输入编码

#### DCA攻击 (2019)
- 差分计算分析
- 捕获内存访问痕迹
- 显著降低逆向工作量

#### DFA攻击
- 差分故障分析
- Dark Phoenix工具支持外部编码场景
- 自动化故障注入

### 防护方案

#### 空间硬度 (Space Hardness)
- **弱空间硬度**: 对抗有限内存攻击者
- **强空间硬度**: 对抗无限制攻击者
- 评估代码提升攻击难度

#### 掩码技术
- 线性布尔掩码
- 非线性掩码组合
- 抗DCA实现

## 自动化表识别

### REPQC算法
- 识别PQC加速器中的Keccak
- 自动化逆向工程
- 硬件木马插入基础

### 硬件逆向工程工具
- **HAL**: 网表分析框架
- **Project X-Ray**: FPGA比特流分析
- **pyecsca**: ECC侧信道分析
```

### 4.5 embedded-structure-extraction.md 更新建议

#### 新增内容：

```markdown
## 固件结构提取

### 固件提取方法
1. **接口读取**: JTAG/SWD/UART
2. **故障注入**: 绕过读保护
3. **软件提取**: 通过漏洞读取

### Binwalk高级用法
```bash
# 自动提取
binwalk -e firmware.bin

# 签名扫描
binwalk -B firmware.bin

# 熵分析
binwalk -E firmware.bin
```

## ML辅助结构识别

### 语义分割应用
- IC图像标准单元识别
- 迁移学习（SAM微调）
- 无监督聚类

### 数据流分析
- 从网表重建层次结构
- 数据路径识别
- 控制流恢复

## 嵌入式密码学分析

### 常见结构
- S-Box查找表
- 轮密钥存储
- 置换表

### 提取技巧
- 内存快照分析
- 运行时动态抓取
- 侧信道辅助定位
```

### 4.6 reversing/README.md 更新建议

#### 新增内容：

```markdown
## 新兴研究领域

### 2024-2025热点
1. **ML辅助逆向工程**
   - LLM赋能的符号执行
   - 自动化字符串反混淆
   - 神经网络辅助反编译

2. **白盒密码学分析**
   - 动态S-Box技术
   - DCA/DFA攻击方法
   - 空间硬度概念

3. **固件与硬件安全**
   - FPGA逆向工程
   - 侧信道分析
   - 故障注入技术

4. **后量子密码学逆向**
   - PQC加速器分析
   - 抗量子算法识别

## 推荐学习路径

### 入门
1. 静态分析基础 (IDA/Ghidra)
2. 动态调试技巧 (x64dbg)
3. Python反编译 (PyLingual)

### 进阶
1. 符号执行与约束求解 (Z3/angr)
2. 混淆代码还原 (控制流/字符串)
3. 密码学算法识别

### 高级
1. 白盒密码学分析
2. 硬件逆向工程
3. 自动化分析框架开发

## 最新工具推荐

### 2025年必备工具
- **PyLingual**: Python完美反编译
- **Dark Phoenix**: 白盒AES分析
- **pyecsca**: ECC侧信道分析
- **HAL**: FPGA网表分析
- **synchrony**: JS反混淆

## 会议与论文跟踪

### 顶级会议
- IEEE S&P: 安全与隐私
- BlackHat USA: 工业界研究
- CHES: 密码硬件与嵌入式系统
- AsiaCCS: 计算机与通信安全

### 2025年重要论文
- PyLingual: Toward Perfect Decompilation (IEEE S&P)
- REPQC: PQC硬件加速器逆向 (AsiaCCS)
- 动态AES S-Box方案 (Electronics期刊)
```

---

## 五、总结与行动计划

### 5.1 知识库现状评估

| 评估维度 | 评分 | 说明 |
|----------|------|------|
| 基础覆盖率 | ⭐⭐⭐⭐ | 主要逆向技术均有涉及 |
| 工具时效性 | ⭐⭐⭐ | 部分工具信息需更新 |
| 深度覆盖 | ⭐⭐⭐ | 部分专题可深化 |
| 前沿跟踪 | ⭐⭐ | 缺少最新研究成果 |
| 案例丰富度 | ⭐⭐⭐⭐ | 已有多个实战案例 |

### 5.2 优先级排序

**高优先级**:
1. 添加 PyLingual 专题（Python反编译）
2. 添加白盒密码学分析专题
3. 更新字符串混淆模式（添加ML辅助反混淆）
4. 更新字节码分析（添加PyLingual）

**中优先级**:
5. 添加固件与嵌入式系统逆向专题
6. 添加ML辅助逆向工程技术专题
7. 更新线性约束校验器（添加LLM-Sym）
8. 更新查表还原技术（添加动态S-Box）

**低优先级**:
9. 添加加密算法自动化识别专题
10. 更新通用README（添加新兴研究领域）

### 5.3 参考资源清单

**学术论文**:
- Wiedemeier et al. "PyLingual: Toward Perfect Decompilation" (IEEE S&P 2025)
- "A Secure and Efficient White-Box Implementation of SM4" (PMC 2024)
- "REPQC: Reverse Engineering and Backdooring Hardware Accelerators for Post-quantum Cryptography" (AsiaCCS 2024)
- "A generic cryptographic algorithm identification scheme based on ciphertext features" (2025)

**工具与框架**:
- PyLingual: https://pylingual.io/
- Dark Phoenix: https://github.com/SideChannelMarvels/DarkPhoenix
- pyecsca: https://github.com/sc arlIACR/pyecsca
- HAL: https://github.com/emsec/hal

**会议演讲**:
- BlackHat USA 2024: PyLingual演讲
- Hardwear.io 2024: FPGA Reverse Engineering训练
- CHES 2024: pyecsca发布

---

*报告生成时间: 2025年4月*
*分析师: AI逆向工程研究助手*
