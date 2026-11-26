"""In-memory event log per agent run. The SSE endpoint replays it from seq 0."""

import asyncio
import secrets
from collections import OrderedDict
from collections.abc import AsyncIterator
from datetime import datetime, timezone

MAX_RUNS = 50


class Run:
    def __init__(self) -> None:
        self.id = "r_" + secrets.token_hex(4)
        self.events: list[dict] = []
        self._changed = asyncio.Condition()

    async def emit(self, type: str, agent: str | None = None, **data) -> None:
        async with self._changed:
            self.events.append(
                {
                    "run_id": self.id,
                    "seq": len(self.events),
                    "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                    "type": type,
                    "agent": agent,
                    "data": data,
                }
            )
            self._changed.notify_all()

    async def stream(self) -> AsyncIterator[dict]:
        """Every event from the start, then live ones, until run_end."""
        seq = 0
        while True:
            async with self._changed:
                await self._changed.wait_for(lambda: len(self.events) > seq)
                batch = self.events[seq:]
            for event in batch:
                yield event
            seq += len(batch)
            if batch[-1]["type"] == "run_end":
                return


_runs: OrderedDict[str, Run] = OrderedDict()


def create_run() -> Run:
    run = Run()
    _runs[run.id] = run
    while len(_runs) > MAX_RUNS:
        _runs.popitem(last=False)
    return run


def get_run(run_id: str) -> Run | None:
    return _runs.get(run_id)
