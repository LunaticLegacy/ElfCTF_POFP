# POFP CTF Agent — Legacy / 旧版

> [!WARNING]
> **This repository contains the old, pre-Angelus implementation of POFP CTF Agent. It is a historical reference only.**
>
> **本仓库是 POFP CTF Agent 在 Angelus 之前的旧版实现，仅供历史参考。** 当前项目正迁移至基于 [Angelus](https://github.com/LunaticLegacy/angelus) 的实现；本仓库不代表当前的架构、工程质量或发展方向。

## What is this? / 这是什么？

This repository is an early experimental CTF agent. It gives an LLM a task workspace, CTF-oriented tools, skills, and local knowledge so that it can work through challenges with minimal manual intervention.

这是一个早期实验性的 CTF 智能体：它为 LLM 提供任务工作区、面向 CTF 的工具、技能和本地知识，以尽量减少人工干预地完成题目分析。

The prototype gradually accumulated a web UI, task persistence, RAG, MCP integration, GZCTF automation, hot-plug tools, and several generations of agent/context logic. It remains an interesting record of the project, but its organically grown architecture has substantial technical debt.

该原型陆续积累了 Web UI、任务持久化、RAG、MCP 集成、GZCTF 自动化、热插拔工具以及多代智能体与上下文逻辑。它保留了项目演进记录，但自然生长的架构也带来了较多技术债务。

- **Old POFP CTF Agent / 旧版：** a standalone application built around `llmfetcher` and application-specific modules / 围绕 `llmfetcher` 与应用专用模块构建的独立 CTF 应用。
- **New POFP CTF Agent / 新版：** an Angelus-based application using the newer runtime and plugin architecture / 基于 Angelus 的应用，采用新的运行时与插件架构。

## Features / 功能

- FastAPI backend and checked-in browser frontend / FastAPI 后端和随仓库提交的浏览器前端；
- Per-task LLM Agent lifecycle: create, start, continue, retry, and stop / 按任务管理 LLM Agent 生命周期：创建、启动、继续、重试和停止；
- Task workspaces, persistence, logs, artifacts, and token tracking / 任务工作区、持久化、日志、产物和 Token 用量追踪；
- Web, Pwn, Crypto, Reverse Engineering, and Misc CTF categories / Web、Pwn、Crypto、逆向和 Misc 等 CTF 分类；
- Local skill routing, prompt enrichment, shell/CTF/hot-plug tools, and local RAG / 本地技能路由、提示词增强、Shell/CTF/热插拔工具及本地 RAG；
- Linear and graph context modes through `llmfetcher`, plus MCP integration / 通过 `llmfetcher` 提供线性和图式上下文模式，并集成 MCP；
- GZCTF login, challenge automation, and automatic flag submission / GZCTF 登录、题目自动化及 Flag 自动提交；
- Docker-oriented CTF analysis environment and static security knowledge tree / 面向 Docker 的 CTF 分析环境与静态安全知识树。

Most capabilities were added directly to the application instead of through stable platform abstractions, which is a key reason this implementation was superseded rather than continually refactored.

多数能力直接堆叠在应用中，而非通过稳定的平台抽象实现；这也是该实现被替代而不是持续重构的主要原因。

## Architecture / 架构

```text
frontend/
    |
    v
FastAPI (api/)
    |
    v
services/
    |
    v
core/ctf_kernel.py
    |
    +--> modules/llmfetcher   # Git submodule; Agent runtime / Agent 运行时
    +--> modules/rag          # application-owned knowledge/RAG / 应用内知识库
    +--> ctf-skills           # Git submodule / Git 子模块
    +--> shell / CTF tools / hotplug tools / MCP / GZCTF integration
```

The core orchestration code centers on `core/ctf_kernel.py`. A task owns a durable `llmfetcher.Agent`; the workflow service refreshes prompts, tools, knowledge access, and runtime configuration before running it in the task workspace.

核心编排代码围绕 `core/ctf_kernel.py`。每项任务拥有可持久化的 `llmfetcher.Agent`；工作流服务会刷新提示词、工具、知识访问和运行时配置，再在任务工作区中运行它。

This design predates Angelus capability/plugin boundaries. Application concerns are spread across `core/`, `services/`, `api/`, `modules/`, and a large frontend with compatibility glue and duplicated responsibilities.

该设计早于 Angelus 的能力与插件边界；应用职责散落在 `core/`、`services/`、`api/`、`modules/` 和大型前端中，并存在兼容层与职责重复。

**Do not use this repository as an architectural reference for current POFP or Angelus.**
**请勿将本仓库作为当前 POFP 或 Angelus 的架构参考。**

## Why it is legacy / 为什么是旧版？

- The CTF application and Agent runtime are tightly coupled / CTF 应用与 Agent 运行时紧耦合；
- Knowledge/RAG is embedded rather than a replaceable capability / 知识库和 RAG 被嵌入应用而非可替换能力；
- Tools, skills, MCP, GZCTF, and orchestration evolved through separate bespoke paths / 工具、技能、MCP、GZCTF 与编排沿各自的专用路径演进；
- Frontend/backend APIs changed repeatedly, leaving compatibility code / 前后端 API 多次变更，遗留了兼容代码；
- Some modules and development paths are stale or inconsistent / 部分模块和开发路径已过时或不一致。

The long-term solution is the Angelus-based replacement, not another large refactor of this tree. New features should generally target that implementation.

长期方案是基于 Angelus 的替代实现，而不是继续大规模重构本仓库；新功能通常应投向新版实现。

## Community / 社区

- QQ group / QQ 群：`1061368718`

## Running the legacy version / 运行旧版

Clone the repository with submodules, create a virtual environment, install dependencies, then start FastAPI:

请递归克隆子模块，创建虚拟环境、安装依赖后启动 FastAPI：

```bash
git clone --recursive https://github.com/LunaticLegacy/ElfCTF_POFP.git
cd ElfCTF_POFP

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn app:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/` and configure an LLM provider before starting a task. / 打开 `http://127.0.0.1:8000/`，并在启动任务前配置 LLM 服务提供商。

The repository uses Git submodules including `modules/llmfetcher`, `modules/tree-memory`, and `ctf-skills`. If you cloned without `--recursive`, run: / 本仓库使用 Git 子模块，包括 `modules/llmfetcher`、`modules/tree-memory` 和 `ctf-skills`。若克隆时未使用 `--recursive`，请运行：

```bash
git submodule update --init --recursive
```

The Dockerfile and helper scripts under `docker_environment/` are legacy development utilities; inspect them before use. / `docker_environment/` 中的 Dockerfile 和辅助脚本属于旧版开发工具，使用前请先检查。

## Security notice / 安全提示

CTF workloads routinely contain untrusted binaries, scripts, documents, and network services. The Agent can invoke shell and other tooling against task files. **Do not treat a task working directory as a security boundary.** Use an appropriately isolated container or virtual machine and grant only the intended permissions and network access.

CTF 工作负载通常包含不受信任的二进制文件、脚本、文档和网络服务。该 Agent 可对任务文件调用 Shell 及其他工具。**请勿将任务工作目录视为安全边界。** 应使用适当隔离的容器或虚拟机，并只授予预期的权限和网络访问。

## Repository status / 仓库状态

**Legacy / maintenance-only. / 旧版，仅维护。** Bug fixes may help reproduce historical behavior, but major architectural work belongs in the Angelus-based POFP CTF Agent.

为复现历史行为而进行的缺陷修复仍可能有价值，但主要架构工作应在基于 Angelus 的 POFP CTF Agent 中进行。

## License / 许可证

This project is licensed under the [Apache License 2.0](LICENSE).
本项目采用 [Apache License 2.0](LICENSE) 许可证。
