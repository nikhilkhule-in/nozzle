"""Run the local orchestrator: python -m nozzle_orch --config orch.json."""

import argparse

import uvicorn

from nozzle_orch.app import create_app


def main():
    parser = argparse.ArgumentParser(description="Nozzle local orchestrator")
    parser.add_argument("--config", default=None, help="JSON config file")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    uvicorn.run(create_app(config_path=args.config), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
