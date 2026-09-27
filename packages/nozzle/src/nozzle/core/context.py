from __future__ import annotations

from contextvars import ContextVar
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from nozzle.sdk.workflow import Workflow

_current_workflow: ContextVar[Workflow | None] = ContextVar(
    "_current_workflow",
    default=None,
)
