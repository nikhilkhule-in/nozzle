ARG NOZZLE_BUILD_PYTHON_VERSION=3.12

FROM python:${NOZZLE_BUILD_PYTHON_VERSION}-slim AS build

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY src ./src

RUN uv build

FROM python:${NOZZLE_BUILD_PYTHON_VERSION}-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

COPY --from=build /app/dist ./dist

RUN whl=$(echo ./dist/*.whl) && uv pip install --system "${whl}[server]"

EXPOSE 8000

CMD ["uvicorn", "nozzle.server:app", "--host", "0.0.0.0", "--port", "8000"]
