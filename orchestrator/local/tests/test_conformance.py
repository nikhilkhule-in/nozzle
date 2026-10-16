"""Task 5.1 verification: the SQLite reference Store passes the shared
Store contract suite (same checks as the FakeStore)."""

import pytest

from shared.conformance import store_suite as suite
from nozzle_orch.store import SQLiteStore


class SQLiteAdapter(SQLiteStore):
    def __init__(self, clock=None, **kwargs):
        self._clock = clock if clock is not None else [0.0]
        super().__init__(path=":memory:", now_fn=lambda: self._clock[0], **kwargs)

    def advance(self, secs):
        self._clock[0] += secs


@pytest.fixture
def make_store(tmp_path):
    def _make(**kwargs):
        return SQLiteAdapter(blob_dir=str(tmp_path), **kwargs)
    return _make


@pytest.mark.parametrize("name", [n for n in dir(suite) if n.startswith("test_")])
def test_contract_against_sqlite_store(make_store, name):
    getattr(suite, name)(make_store)
