"""Workflows-as-code: parse-time DAG construction over the Rust core.

A workflow function runs once at parse time. Calling a `@task`-decorated
function inside it records a task node and returns an `OutputRef` future;
passing that future into another task records a dependency edge. Nothing
executes here — workers execute tasks later from the pinned bundle.

Rules (distributed semantics, enforced at parse):
- Task functions must live at module level so workers can import them by
  `module:qualname`. Nested definitions fail with guidance.
- Each task function may be called at most once per workflow; node identity
  is the function name.
- Call arguments must be output references or JSON-serializable literals.
- Workflow functions take no parameters in MVP (run inputs are recorded by
  the orchestrator but not yet wired into parsing).
"""

import inspect
import json
from contextvars import ContextVar
from dataclasses import dataclass, field

from nozzle.nozzle_core_ext import validate_workflow

LANGUAGE = "python"
DEFAULT_RUNTIME = "local-process"
DEFAULT_BUNDLE = "local-dev"

_VALID_POLICIES = ("auto", "inline-only", "blob-only")


@dataclass
class OutputRef:
    """Promise of a task's future output. Never truth-test one (see 4.2)."""

    task: str
    policy: str = "auto"


@dataclass
class _Builder:
    workflow_id: str
    bundle: str
    tasks: dict = field(default_factory=dict)
    edges: list = field(default_factory=list)
    policies: dict = field(default_factory=dict)
    code: dict = field(default_factory=dict)

    def add_task(self, name, runtime, policy, code_ref):
        if name in self.tasks:
            raise ValueError(
                f"task {name!r} called twice in one workflow; "
                "each task function may be called at most once"
            )
        self.tasks[name] = {"name": name, "runtime": runtime}
        self.policies[name] = policy
        self.code[name] = code_ref

    def add_edge(self, upstream, downstream, arg):
        self.edges.append(
            {"upstream": upstream, "downstream": downstream, "arg": arg}
        )

    def to_spec(self):
        return {
            "id": self.workflow_id,
            "language": LANGUAGE,
            "tasks": list(self.tasks.values()),
            "edges": list(self.edges),
            "policies": dict(self.policies),
            "code": dict(self.code),
        }


_current: ContextVar = ContextVar("nozzle_workflow", default=None)


def _active_builder():
    builder = _current.get()
    if builder is None:
        raise RuntimeError(
            "task called outside workflow parsing; call tasks only "
            "inside a @workflow function body"
        )
    return builder


def _check_literal(value, task_name, param):
    try:
        json.dumps(value)
    except (TypeError, ValueError):
        raise ValueError(
            f"argument {param!r} of task {task_name!r} must be an OutputRef "
            "or a JSON-serializable literal"
        )


def task(_func=None, *, store="auto", runtime=DEFAULT_RUNTIME):
    """Declare a task. Usable bare (`@task`) or with options
    (`@task(store=\"blob-only\", runtime=\"cf-container\")`)."""
    if store not in _VALID_POLICIES:
        raise ValueError(f"unknown placement policy {store!r}; expected one of {_VALID_POLICIES}")

    def wrap(func):
        if "<locals>" in func.__qualname__:
            raise ValueError(
                f"task {func.__name__!r} is defined inside another function; "
                "tasks must live at module level so workers can import them as "
                "module:qualname"
            )
        sig = inspect.signature(func)
        code_ref = f"{func.__module__}:{func.__qualname__}"

        def invoke(*args, **kwargs):
            builder = _active_builder()
            try:
                bound = sig.bind(*args, **kwargs)
            except TypeError as e:
                raise ValueError(f"bad arguments for task {func.__name__!r}: {e}")
            bound.apply_defaults()
            for param, value in bound.arguments.items():
                if isinstance(value, OutputRef):
                    builder.add_edge(value.task, func.__name__, param)
                else:
                    _check_literal(value, func.__name__, param)
            builder.add_task(func.__name__, runtime, store, code_ref)
            return OutputRef(task=func.__name__, policy=store)

        invoke._nozzle_task__ = True
        invoke._nozzle_runtime__ = runtime
        invoke._nozzle_store__ = store
        return invoke

    if _func is not None:
        if not callable(_func):
            raise ValueError("@task takes only keyword options")
        return wrap(_func)
    return wrap


def workflow(_func=None, *, id=None, bundle=DEFAULT_BUNDLE):
    """Parse a workflow function into a validated spec dict.

    Usable bare (`@workflow`, id defaults to the function name) or with
    options (`@workflow(id=\"etl\", bundle=\"main-etl\")`). Returns the spec,
    not a runnable object: execution happens on workers.
    """

    def wrap(func):
        sig = inspect.signature(func)
        if any(
            p.default is inspect.Parameter.empty
            and p.kind in (inspect.Parameter.POSITIONAL_ONLY,
                           inspect.Parameter.POSITIONAL_OR_KEYWORD,
                           inspect.Parameter.KEYWORD_ONLY)
            for p in sig.parameters.values()
        ):
            raise ValueError(
                f"workflow {func.__name__!r} takes parameters; MVP workflows "
                "take none (run inputs are not yet wired into parsing)"
            )
        workflow_id = id or func.__name__
        builder = _Builder(workflow_id=workflow_id, bundle=bundle)
        token = _current.set(builder)
        try:
            func()
        finally:
            _current.reset(token)
        spec = builder.to_spec()
        try:
            validate_workflow(json.dumps(
                {"id": spec["id"], "language": spec["language"],
                 "tasks": spec["tasks"], "edges": spec["edges"]}))
        except ValueError as e:
            raise ValueError(f"invalid workflow {workflow_id!r}: {e}")
        return spec

    if _func is not None:
        if not callable(_func):
            raise ValueError("@workflow takes only keyword options")
        return wrap(_func)
    return wrap
