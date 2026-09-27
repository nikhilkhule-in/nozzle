import inspect
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from nozzle.sdk.workflow import Workflow


@dataclass
class Task:
    """This task to be executed."""

    func: Callable
    args: tuple[Any, ...] = ()
    kwargs: dict[str, Any] = field(default_factory=dict)

    def __call__(
        self,
    ):
        result = self.func(
            *self.args,
            **(self.kwargs or {}),
        )
        return result


def task(func: Callable):
    # Capture the function definition
    sig = inspect.signature(func)

    def extract_args_kwargs(
        *args,
        **kwargs,
    ):
        bound_args_kwargs = sig.bind(
            *args,
            **kwargs,
        )
        bound_args_kwargs.apply_defaults()
        this_task = Task(
            func=func,
            args=bound_args_kwargs.args,
            kwargs=bound_args_kwargs.kwargs,
        )
        Workflow.current().enqueue(
            this_task,
        )
        return this_task

    return extract_args_kwargs
