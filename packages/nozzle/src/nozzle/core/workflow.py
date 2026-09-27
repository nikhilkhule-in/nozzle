from collections.abc import Callable
from dataclasses import dataclass, field

from nozzle.core.context import _current_workflow


@dataclass
class Workflow:
    id: str | None = None
    queue: list = field(default_factory=list)

    @classmethod
    def current(cls) -> "Workflow":
        workflow = _current_workflow.get()

        if workflow is None:
            raise RuntimeError("No workflow is currently being constructed")

        return workflow

    def enqueue(self, task):
        self.queue.append(task)

    def __call__(self):
        results = []
        for task in self.queue:
            result = task()
            results.append(result)
        return results


def workflow(
    func: Callable,
    workflow_id: str | None = None,
    schedule=str,
):
    """Parse the workflow."""
    if workflow_id is None:
        workflow_id = func.__name__

    wf = Workflow(id=workflow_id)

    # Set the workflow in the current context
    token = _current_workflow.set(wf)

    try:
        # Start executing the actual function to enqueue
        # deferred tasks.
        func()
    finally:
        _current_workflow.reset(token)

    return wf
