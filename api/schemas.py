"""Pydantic schemas for the GUI API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PipelineConfigRequest(BaseModel):
    video_path: str
    model: str | None = None
    models: list[str] | None = None
    bilingual: bool = False
    no_translate: bool = False
    no_vad: bool = False
    isolate_vocals: bool = False
    context: int = Field(default=12, ge=0)
    max_wait: float = Field(default=120.0, gt=0)
    fresh: bool = False
    redo_translate: bool = False
    start: float = Field(default=0.0, ge=0)
    end: float | None = Field(default=None, ge=0)
    languages: str = "bn,hi,en"


class JobCreateResponse(BaseModel):
    job_id: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    exit_code: int | None = None
    error: str | None = None
    raw_path: str | None = None
    srt_path: str | None = None
    video_path: str | None = None


class FilePickResponse(BaseModel):
    path: str | None
    cancelled: bool = False


class CuePreview(BaseModel):
    id: int
    start: float
    end: float
    text: str
    language: str | None = None
    translation: str | None = None


class PreviewResponse(BaseModel):
    cues: list[CuePreview]
    raw_path: str | None = None
    srt_path: str | None = None
