"""Compatibility exports for the ElfCTF core package.

The project now keeps HTTP adapters in `api`, application services in
`services`, and CTF-solving domain orchestration in `core`.
"""

from .ctf_kernel import CTFWorkflowService, WorkflowResult

CTFKernel = CTFWorkflowService

__all__ = ['CTFKernel', 'CTFWorkflowService', 'WorkflowResult']
