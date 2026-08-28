"""FastAPI server for the whisper-subtitles GUI."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from api.jobs import job_manager
from api.schemas import (
    CuePreview,
    FilePickResponse,
    JobCreateResponse,
    JobStatusResponse,
    PipelineConfigRequest,
    PreviewResponse,
)
from pipeline import OUTPUT_DIR, PipelineConfig, check_health, load_dotenv_if_available

ROOT = Path(__file__).parent.parent

app = FastAPI(title="whisper-subtitles API", version="1.0.0")


@app.on_event("startup")
def startup():
    load_dotenv_if_available()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _config_from_request(req: PipelineConfigRequest) -> PipelineConfig:
    return PipelineConfig(
        video_path=req.video_path,
        backend=req.backend,
        model=req.model,
        models=req.models,
        local_model=req.local_model,
        bilingual=req.bilingual,
        no_translate=req.no_translate,
        no_vad=req.no_vad,
        isolate_vocals=req.isolate_vocals,
        context=req.context,
        max_wait=req.max_wait,
        fresh=req.fresh,
        redo_translate=req.redo_translate,
        start=req.start,
        end=req.end,
        languages=req.languages,
    )


def _validate_output_path(path_str: str) -> Path:
    path = Path(path_str).resolve()
    output_root = OUTPUT_DIR.resolve()
    if not str(path).startswith(str(output_root)):
        raise HTTPException(status_code=403, detail="Path outside output directory")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return path


@app.get("/api/health")
def health():
    return check_health()


@app.post("/api/pick-file", response_model=FilePickResponse)
def pick_file():
    if sys.platform != "darwin":
        raise HTTPException(
            status_code=501,
            detail="Native file picker is only supported on macOS",
        )
    script = (
        'POSIX path of (choose file of type {"mp4", "public.mpeg-4"} '
        'with prompt "Select a video file")'
    )
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        return FilePickResponse(path=None, cancelled=True)
    if result.returncode != 0:
        return FilePickResponse(path=None, cancelled=True)
    path = result.stdout.strip()
    if not path:
        return FilePickResponse(path=None, cancelled=True)
    if not Path(path).is_file():
        raise HTTPException(status_code=400, detail=f"Selected file not found: {path}")
    return FilePickResponse(path=path, cancelled=False)


@app.post("/api/jobs", response_model=JobCreateResponse)
async def create_job(req: PipelineConfigRequest):
    video = Path(req.video_path)
    if not video.is_file():
        raise HTTPException(status_code=400, detail=f"File not found: {req.video_path}")
    if req.end is not None and req.end <= req.start:
        raise HTTPException(status_code=400, detail="end must be greater than start")

    if job_manager.has_active_job():
        raise HTTPException(status_code=409, detail="Another job is already running")

    config = _config_from_request(req)
    job = job_manager.create_job(config)
    loop = __import__("asyncio").get_running_loop()
    if not job_manager.start_job(job, loop):
        raise HTTPException(status_code=409, detail="Could not start job")
    return JobCreateResponse(job_id=job.job_id)


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
def get_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        job_id=job.job_id,
        status=job.status,
        exit_code=job.exit_code,
        error=job.error,
        raw_path=job.raw_path,
        srt_path=job.srt_path,
        video_path=job.config.video_path,
    )


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    if not job_manager.cancel_job(job_id):
        raise HTTPException(status_code=400, detail="Job not running or not found")
    return {"ok": True}


@app.get("/api/jobs/{job_id}/preview", response_model=PreviewResponse)
def preview_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    cues = [
        CuePreview(
            id=c["id"],
            start=c["start"],
            end=c["end"],
            text=c["text"],
            language=c.get("language"),
            translation=c.get("translation"),
        )
        for c in job.cues
    ]
    return PreviewResponse(
        cues=cues,
        raw_path=job.raw_path,
        srt_path=job.srt_path,
    )


@app.get("/api/files/download")
def download_file(path: str):
    file_path = _validate_output_path(path)
    return FileResponse(
        file_path,
        media_type="application/x-subrip",
        filename=file_path.name,
    )


@app.websocket("/api/jobs/{job_id}/events")
async def job_events(websocket: WebSocket, job_id: str):
    await websocket.accept()
    queue = job_manager.subscribe(job_id)
    if queue is None:
        await websocket.close(code=4404)
        return
    try:
        while True:
            event = await queue.get()
            await websocket.send_json(event)
            if event.get("type") in ("job_completed", "job_failed", "quota_paused"):
                job = job_manager.get_job(job_id)
                if job and job.status in (
                    "completed", "failed", "quota_paused", "cancelled",
                ):
                    break
    except WebSocketDisconnect:
        pass
    finally:
        job_manager.unsubscribe(job_id, queue)
