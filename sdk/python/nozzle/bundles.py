"""Bundle parsing: workflow files to spec dicts.

Importing a workflow file executes its `@workflow` bodies at parse time. The
decorator records each produced spec in `_PARSED_SPECS`; `parse_file`
snapshots that list around the import and returns what the file defined.
Workers later materialize the same file at the run's pinned version and
import tasks from it by `code` reference (`module:qualname`).
"""

import hashlib
import importlib.util
import sys

PARSED_SPECS = []


def record_spec(spec):
    PARSED_SPECS.append(spec)


def parse_file(path, workflow_id=None):
    """Import `path` and return the workflow specs it defines.

    `workflow_id` optionally selects one; missing files, files defining no
    workflows, and unknown ids all raise `ValueError`.
    """
    import pathlib

    path = pathlib.Path(path)
    if not path.is_file():
        raise ValueError(f"bundle file not found: {path}")
    module_name = "_nozzle_bundle_" + hashlib.sha256(
        str(path.resolve()).encode()
    ).hexdigest()[:12]
    before = len(PARSED_SPECS)
    sys.path.insert(0, str(path.parent))
    try:
        spec = importlib.util.spec_from_file_location(module_name, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(path.parent))
        sys.modules.pop(module_name, None)
    new_specs = PARSED_SPECS[before:]
    for spec in new_specs:
        # Tasks must live in the parsed file (MVP single-file workflows), so
        # code refs are bundle-root-relative and importable by workers.
        spec["source"] = {"file": path.name}
        for task_spec in spec["tasks"]:
            spec["code"][task_spec["name"]] = f"{path.stem}:{task_spec['name']}"
    if workflow_id is not None:
        new_specs = [s for s in new_specs if s["id"] == workflow_id]
        if not new_specs:
            raise ValueError(
                f"workflow {workflow_id!r} not defined in bundle file {path}"
            )
    if not new_specs:
        raise ValueError(f"no workflows defined in bundle file {path}")
    return new_specs
