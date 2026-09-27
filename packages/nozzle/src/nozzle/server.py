"""Small FastAPI server for the nozzle package.

Requires the ``server`` extra: ``pip install nozzle[server]``.
"""

try:
    from fastapi import FastAPI
except ImportError as e:
    raise ImportError(
        "The nozzle server requires the 'server' extra: pip install nozzle[server]"
    ) from e

app = FastAPI(title="nozzle")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "nozzle"}


def main() -> None:
    import uvicorn

    uvicorn.run("nozzle.server:app", host="0.0.0.0", port=8000)
