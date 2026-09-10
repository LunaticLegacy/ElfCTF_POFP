# POFP CTF Agent — Legacy

> [!WARNING]
> **This repository contains the old, pre-Angelus implementation of POFP CTF Agent.**
>
> It is preserved as a historical snapshot and for reference. The current POFP CTF Agent is being rebuilt on top of [Angelus](https://github.com/LunaticLegacy/angelus). This codebase is **not** representative of the current architecture, engineering quality, or development direction.

## What is this?

This repository is an early experimental CTF agent built before Angelus existed.

The goal was simple: give an LLM a task workspace, CTF-oriented tools, skills and local knowledge, then let it work through challenges with as little manual intervention as possible.

Over time the prototype accumulated a web UI, task persistence, RAG, MCP integration, GZCTF automation, hot-plug tools and several generations of agent/context logic. It works as an interesting fossil of the project, but the architecture grew organically and carries a large amount of technical debt.

In short:

- **old POFP CTF Agent:** a standalone CTF application built directly around `llmfetcher` and a pile of application-specific modules;
- **new POFP CTF Agent:** an Angelus-based application, using the newer runtime/plugin architecture instead of continuing to extend this codebase.

## Features in this legacy version

The repository contains, among other things:

- FastAPI backend with a checked-in browser frontend;
- per-task LLM Agent lifecycle: create, start, continue, retry and stop;
- task workspaces, persistence, logs, artifacts and token-usage tracking;
- CTF task categories for Web / Pwn / Crypto / Reverse Engineering / Misc;
- local CTF skill routing and prompt enrichment;
- shell tools, CTF-specific tools and externally hot-plugged tools;
- local knowledge base / RAG integration;
- linear and graph-style context modes provided through `llmfetcher`;
- MCP-related integrations;
- GZCTF login, challenge automation and flag auto-submission;
- a Docker-based CTF analysis environment;
- a static knowledge tree containing reversing, unpacking, anti-analysis and pwn notes.

Most of these capabilities were added directly into the application rather than through a stable platform abstraction. That is one of the main reasons the project was later replaced instead of continuously refactored.

## Architecture

A very simplified view of the old stack is:

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
    +--> modules/llmfetcher   # Git submodule; Agent runtime
    +--> modules/rag          # application-owned knowledge/RAG
    +--> ctf-skills           # Git submodule
    +--> shell / CTF tools
    +--> hotplug tools
    +--> MCP
    +--> GZCTF integration
```

The central orchestration code lives around `core/ctf_kernel.py`. A task owns a durable `llmfetcher.Agent`; the workflow service refreshes its prompt, tools, knowledge access and runtime configuration, then runs the agent inside a task workspace.

This design predates the capability/plugin boundaries used by Angelus. In this repository, application concerns are spread across `core/`, `services/`, `api/`, `modules/` and a large frontend, with compatibility glue and duplicated responsibilities accumulated over multiple iterations.

**Do not use this repository as an architectural reference for current POFP or Angelus.**

## Why it is legacy

The old implementation has several structural problems that are intentionally not being solved here:

- the CTF application and Agent runtime are tightly coupled;
- knowledge/RAG is embedded as application modules instead of a replaceable capability;
- tools, skills, MCP, GZCTF and task orchestration each evolved through bespoke integration paths;
- frontend and backend APIs changed repeatedly and left substantial compatibility code behind;
- responsibilities are distributed across large modules and service layers;
- some helper scripts and development paths are stale or inconsistent;
- the repository contains prototype-quality code and should be expected to have rough edges.

The correct long-term fix is not another large refactor of this tree. The replacement architecture is Angelus-based.

## New POFP CTF Agent

Current development moves the CTF product onto [Angelus](https://github.com/LunaticLegacy/angelus).

The important change is architectural: CTF-specific behavior should become an application/plugin layer on top of a reusable Agent runtime, rather than hard-coding every capability into one standalone codebase.

This repository therefore remains useful mainly for:

- understanding the historical evolution of POFP CTF Agent;
- recovering old CTF-specific tools, workflows or experiments;
- comparing the pre-Angelus and Angelus-based designs;
- reproducing older demos or research experiments.

New features should generally target the Angelus-based implementation instead of this repository.

## Running the legacy version

If you still want to run it, clone the submodules as well:

```bash
git clone --recursive https://github.com/LunaticLegacy/ElfCTF_POFP.git
cd ElfCTF_POFP

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn app:app --host 127.0.0.1 --port 8000
```

Then open `http://127.0.0.1:8000/` and configure an LLM provider before starting a task.

The repository uses Git submodules for at least:

```text
modules/llmfetcher
modules/tree-memory
ctf-skills
```

If you cloned without `--recursive`:

```bash
git submodule update --init --recursive
```

### Docker environment

A CTF-oriented Dockerfile and helper scripts are included under `docker_environment/`. They are legacy development utilities; inspect them before use rather than assuming the helper scripts are mutually consistent or production-ready.

## Security notice

CTF workloads routinely involve untrusted binaries, scripts, documents and network services. The Agent can invoke shell/tooling workflows against task files.

**Do not treat a task working directory as a security boundary.** Run untrusted challenges inside an appropriately isolated container or virtual machine, with only the permissions and network access you intend to grant.

## Repository status

**Legacy / maintenance-only.**

Bug fixes may still be useful for reproducing historical behavior, but major architectural work belongs in the Angelus-based POFP CTF Agent.

If you are looking at this code and thinking “this is a pile of technical debt”: yes. That is part of why the new version exists.
