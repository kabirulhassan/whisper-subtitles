import { useState } from "react";
import type { CuePreview } from "../types";
import { downloadUrl } from "../api";
import { Card } from "./ui/Card";

function formatTimestamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const milli = ms % 1_000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

interface SrtPreviewProps {
  cues: CuePreview[];
  rawPath: string | null;
  srtPath: string | null;
}

export function SrtPreview({ cues, rawPath, srtPath }: SrtPreviewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);

  if (cues.length === 0 && !rawPath && !srtPath) {
    return null;
  }

  const filteredCues = cues.filter((cue) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      cue.text.toLowerCase().includes(query) ||
      (cue.translation && cue.translation.toLowerCase().includes(query)) ||
      String(cue.id).includes(query) ||
      formatTimestamp(cue.start).includes(query)
    );
  });

  async function handleCopy() {
    const text = cues
      .map((c) => `${c.id}\n${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${c.translation ?? c.text}\n`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <Card
      title="Subtitle Studio Inspector"
      badge={
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-secondary font-medium">
            {cues.length} Cues Generated
          </span>
        </div>
      }
      className="animate-fade-up"
      delay={200}
      compact
    >
      {/* Top Action Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#2c3347] pb-3">
        {/* Search input */}
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cues, translation, or timestamp..."
            className="w-full rounded-lg border border-[#2c3347] bg-[#090a0d] px-3 py-1.5 pl-8 font-mono text-xs text-[#e3e2e6] placeholder:text-[#555d73] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <svg
            className="absolute left-2.5 top-2 text-[#555d73]"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>

        {/* Download Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {rawPath && (
            <a
              href={downloadUrl(rawPath)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c3347] bg-[#12151d] px-2.5 py-1.5 font-mono text-xs font-medium text-[#949db2] transition hover:border-secondary/50 hover:text-[#e3e2e6]"
            >
              <DownloadIcon />
              .raw.srt (Original)
            </a>
          )}
          {srtPath && (
            <a
              href={downloadUrl(srtPath)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/20 px-3 py-1.5 font-mono text-xs font-semibold text-primary-light transition hover:bg-primary/30 hover:border-primary shadow-sm"
            >
              <DownloadIcon />
              Download .srt (Translated)
            </a>
          )}
          {cues.length > 0 && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c3347] bg-[#12151d] px-2.5 py-1.5 font-mono text-xs text-[#949db2] hover:text-[#e3e2e6] transition"
            >
              <CopyIcon />
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      </div>

      {/* Dual-Track Subtitle Table */}
      {cues.length > 0 ? (
        <div className="max-h-80 overflow-auto rounded-lg border border-[#2c3347] bg-[#050608]/90">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-[#2c3347] bg-[#0d0e11] font-mono text-[10px] uppercase tracking-wider text-[#949db2]">
              <tr>
                <th className="w-12 px-3 py-2 font-semibold">#</th>
                <th className="w-40 px-3 py-2 font-semibold">Timecode</th>
                <th className="px-3 py-2 font-semibold">Original Speech</th>
                <th className="px-3 py-2 font-semibold">English Translation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f1f23]">
              {filteredCues.map((cue, i) => (
                <tr
                  key={cue.id}
                  className={`group transition-colors hover:bg-primary/5 ${
                    i % 2 === 0 ? "bg-[#090a0d]/50" : "bg-[#0e1014]/50"
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-[11px] text-[#555d73] group-hover:text-primary">
                    {cue.id}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-secondary">
                    {formatTimestamp(cue.start)}
                  </td>
                  <td className="px-3 py-2 text-[#949db2]">
                    <div className="flex flex-col gap-0.5">
                      {cue.language && (
                        <span className="self-start rounded bg-[#1f1f23] px-1 py-0.2 font-mono text-[9px] text-[#555d73]">
                          {cue.language}
                        </span>
                      )}
                      <span>{cue.text}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium text-white">
                    {cue.translation ? (
                      <span>{cue.translation}</span>
                    ) : (
                      <span className="text-[#555d73] italic">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-[#2c3347] bg-[#050608] p-4 text-center">
          <p className="font-mono text-xs text-[#949db2]">
            Subtitles generated &amp; saved to output directory.
          </p>
        </div>
      )}
    </Card>
  );
}
