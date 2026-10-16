"""Runs the Store contract suite against the in-memory reference Store.

Providers reuse `store_suite` with their own `make_store` fixture; this file
proves the suite itself is green on the reference behavior (task 3.3).
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from conformance import store_suite as suite  # noqa: E402


@pytest.fixture
def make_store():
    def _make(**kwargs):
        return suite.FakeStore(**kwargs)
    return _make


SUITE_TESTS = [n for n in dir(suite) if n.startswith("test_")]


def test_suite_covers_contract():
    assert len(SUITE_TESTS) >= 12, SUITE_TESTS


@pytest.mark.parametrize("name", SUITE_TESTS)
def test_contract_against_fake_store(make_store, name):
    getattr(suite, name)(make_store)
