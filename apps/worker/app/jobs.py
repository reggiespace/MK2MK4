"""In-memory job store for tracking render progress."""
import threading
from dataclasses import dataclass, field
from typing import Any

_lock = threading.Lock()
_store: dict[str, "Job"] = {}


@dataclass
class Job:
    id: str
    status: str = "running"   # running | done | failed
    progress: int = 0
    result: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


def create(job_id: str) -> Job:
    job = Job(id=job_id)
    with _lock:
        _store[job_id] = job
    return job


def get(job_id: str) -> Job | None:
    with _lock:
        return _store.get(job_id)


def update(job_id: str, **kwargs: Any) -> None:
    with _lock:
        job = _store.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)
