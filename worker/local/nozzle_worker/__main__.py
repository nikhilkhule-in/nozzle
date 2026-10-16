"""Run a local worker: python -m nozzle_worker --orch-url URL --bundles worker.json."""

import argparse
import json
import threading

from nozzle_worker.worker import Worker


def main():
    parser = argparse.ArgumentParser(description="Nozzle local worker")
    parser.add_argument("--orch-url", required=True)
    parser.add_argument("--worker-id", default=None)
    parser.add_argument("--bundles", required=True, help="JSON file with a 'bundles' list")
    parser.add_argument("--poll-interval", type=float, default=2.0)
    parser.add_argument("--until-idle", type=int, default=0,
                        help="exit after N consecutive no-work polls (0 = run forever)")
    args = parser.parse_args()
    with open(args.bundles) as f:
        bundles = json.load(f)["bundles"]
    worker = Worker(args.orch_url, worker_id=args.worker_id, bundles=bundles,
                    poll_interval=args.poll_interval)
    print(worker.register(), flush=True)
    idle = 0
    stop = threading.Event()
    try:
        while True:
            if worker.run_once():
                idle = 0
            else:
                idle += 1
                if args.until_idle and idle >= args.until_idle:
                    break
                stop.wait(args.poll_interval)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
