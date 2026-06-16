"""In-memory job runner with WebSocket event broadcasting."""

from __future__ import annotations

import asyncio
import threading
import uuid
from dataclasses import dataclass, field
from typing import Any

from pipeline import (
    EXIT_ERROR,
    EXIT_QUOTA,
    EXIT_SUCCESS,
    PipelineCancelled,
    PipelineConfig,
    PipelineError,
    ProgressEvent,
    run_pipeline,
)


@dataclass
class Job:
    job_id: str
    config: PipelineConfig
    status: str = "pending"
    exit_code: int | None = None
    error: str | None = None
    raw_path: str | None = None
    srt_path: str | None = None
    cues: list[dict[str, Any]] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    _cancel: threading.Event = field(default_factory=threading.Event)
    _thread: threading.Thread | None = None
    _subscribers: list[asyncio.Queue] = field(default_factory=list)
    _loop: asyncio.AbstractEventLoop | None = None


class JobManager:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._active_job_id: str | None = None

    def create_job(self, config: PipelineConfig) -> Job:
        job_id = str(uuid.uuid4())
        job = Job(job_id=job_id, config=config)
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def has_active_job(self) -> bool:
        with self._lock:
            if self._active_job_id is None:
                return False
            job = self._jobs.get(self._active_job_id)
            return job is not None and job.status == "running"

    def start_job(self, job: Job, loop: asyncio.AbstractEventLoop) -> bool:
        with self._lock:
            if self._active_job_id is not None:
                active = self._jobs.get(self._active_job_id)
                if active and active.status == "running":
                    return False
            self._active_job_id = job.job_id
        job._loop = loop
        job.status = "running"
        job._thread = threading.Thread(target=self._run, args=(job,), daemon=True)
        job._thread.start()
        return True

    def cancel_job(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if not job or job.status != "running":
            return False
        job._cancel.set()
        return True

    def subscribe(self, job_id: str) -> asyncio.Queue | None:
        job = self._jobs.get(job_id)
        if not job:
            return None
        q: asyncio.Queue = asyncio.Queue()
        job._subscribers.append(q)
        for event in job.events:
            q.put_nowait(event)
        return q

    def unsubscribe(self, job_id: str, queue: asyncio.Queue):
        job = self._jobs.get(job_id)
        if job and queue in job._subscribers:
            job._subscribers.remove(queue)

    def _broadcast(self, job: Job, event: dict[str, Any]):
        job.events.append(event)
        loop = job._loop
        if loop is None:
            return
        for q in list(job._subscribers):
            loop.call_soon_threadsafe(q.put_nowait, event)

    def _run(self, job: Job):
        def on_event(event: ProgressEvent):
            self._broadcast(job, event.to_dict())

        try:
            result = run_pipeline(
                job.config,
                on_event=on_event,
                cancel_event=job._cancel,
            )
            job.exit_code = result.exit_code
            job.cues = result.cues
            job.raw_path = str(result.raw_path) if result.raw_path else None
            job.srt_path = str(result.srt_path) if result.srt_path else None
            if result.exit_code == EXIT_QUOTA:
                job.status = "quota_paused"
                job.error = result.error
            else:
                job.status = "completed"
        except PipelineCancelled:
            job.status = "cancelled"
            job.exit_code = EXIT_ERROR
            job.error = "Job cancelled"
            self._broadcast(job, {
                "type": "job_failed",
                "message": "Job cancelled",
                "exit_code": EXIT_ERROR,
            })
        except PipelineError as e:
            job.status = "failed"
            job.exit_code = e.exit_code
            job.error = str(e)
            self._broadcast(job, {
                "type": "job_failed",
                "message": str(e),
                "exit_code": e.exit_code,
            })
        except Exception as e:  # noqa: BLE001
            job.status = "failed"
            job.exit_code = EXIT_ERROR
            job.error = str(e)
            self._broadcast(job, {
                "type": "job_failed",
                "message": str(e),
                "exit_code": EXIT_ERROR,
            })
        finally:
            with self._lock:
                if self._active_job_id == job.job_id:
                    self._active_job_id = None


job_manager = JobManager()
