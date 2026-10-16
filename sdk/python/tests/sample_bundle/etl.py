"""Sample bundle project used by parser and worker tests."""

from nozzle.sdk import task, workflow


@task
def extract(date):
    return {"date": date, "rows": 100}


@task(store="blob-only")
def load(snapshot):
    return len(snapshot)


@workflow(id="sample_etl", bundle="local-dev")
def sample_etl():
    snapshot = extract("2026-10-16")
    load(snapshot)
