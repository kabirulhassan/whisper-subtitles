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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface SrtPreviewProps {
  cues: CuePreview[];
  rawPath: string | null;
  srtPath: string | null;
}

export function SrtPreview({ cues, rawPath, srtPath }: SrtPreviewProps) {
  if (cues.length === 0 && !rawPath && !srtPath) {
    return null;
  }

  return (
    <Card title="Transcript" className="animate-fade-up" delay={200} compact>
      <div className="mb-2 flex gap-2">
        {rawPath && (
          <a
            href={downloadUrl(rawPath)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-2 py-1 text-[11px] text-zinc-400 transition hover:border-white/[0.14] hover:text-zinc-200"
          >
            <DownloadIcon />
            .raw.srt
          </a>
        )}
        {srtPath && (
          <a
            href={downloadUrl(srtPath)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-2 py-1 text-[11px] text-zinc-400 transition hover:border-white/[0.14] hover:text-zinc-200"
          >
            <DownloadIcon />
            .srt
          </a>
        )}
      </div>

      {cues.length > 0 ? (
        <div className="max-h-64 overflow-auto rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-stage-elevated/95 text-[10px] uppercase tracking-wider text-zinc-500 backdrop-blur-sm">
              <tr>
                <th className="px-2 py-1 font-medium">#</th>
                <th className="px-2 py-1 font-medium">Time</th>
                <th className="px-2 py-1 font-medium">Original</th>
                <th className="hidden px-2 py-1 font-medium sm:table-cell">Translation</th>
              </tr>
            </thead>
            <tbody>
              {cues.map((cue, i) => (
                <tr key={cue.id} className={i % 2 === 0 ? "bg-white/[0.02]" : ""}>
                  <td className="px-2 py-1 text-zinc-600">{cue.id}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-[10px] text-zinc-500">
                    {formatTimestamp(cue.start)}
                  </td>
                  <td className="px-2 py-1 text-zinc-300">{cue.text}</td>
                  <td className="hidden px-2 py-1 text-zinc-500 sm:table-cell">
                    {cue.translation ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500">Files written — preview pending.</p>
      )}
    </Card>
  );
}
