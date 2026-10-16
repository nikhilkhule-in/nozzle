"""Contract error types shared by the Store behavior contract and every
provider implementation. Raised across process and implementation
boundaries, so all parties import these rather than defining their own.
"""


class StoreError(Exception):
    """Base for expected orchestrator failures (maps to HTTP 4xx)."""


class LeaseLost(StoreError):
    """Task lease is owned by someone else, expired, or gone (HTTP 409)."""


class NotFound(StoreError):
    """Referenced workflow, run, task, worker, or blob does not exist (HTTP 404)."""
