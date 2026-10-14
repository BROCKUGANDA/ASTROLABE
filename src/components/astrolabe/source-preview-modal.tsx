"use client";

/* ============================================================
   ASTROLABE — Source preview modal (PRD §13 — cited answers)
   Opens when an employee clicks a 3D citation chip on an Ask
   answer card. Shows the full policy chunk text with the cited
   sentence highlighted in teal. Frosted-glass background, 200ms
   scale-in. Footer links to the full policy + copy citation.

   The cited sentence (Citation.snippet) is the exact string the
   Ask engine quoted from the policy chunk. We fetch the parent
   doc via /api/v1/policies/{docSlug}, find the matching section
   (by `section` + `lang`), and render its `text` with the
   snippet wrapped in <mark> (teal 0.22 opacity background).
   ============================================================ */

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  FileText,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Sparkles,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NOW as PACK_NOW } from "@/lib/data/pack";
import { toast } from "sonner";

/* ---------- Types (mirror the API envelope) ---------- */

export interface SourceCitation {
  docSlug: string;
  title: string;
  section: string;
  effectiveDate: string;
  reviewDate: string;
  lang: string;
  chunkId: string;
  snippet: string;
}

interface PolicySection {
  section: string;
  effectiveDate: string;
  reviewDate: string;
  lang: "en" | "ar";
  text: string;
}

interface PolicyDoc {
  docSlug: string;
  title: string;
  titleAr: string;
  sections: PolicySection[];
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string; latencyMs?: number };
  error: { code: string; message: string; hint?: string } | null;
}

/* ---------- Helpers ---------- */

function isStale(reviewDate: string): boolean {
  return new Date(reviewDate) < PACK_NOW;
}

/**
 * Render the chunk text with the cited sentence wrapped in <mark>.
 * Falls back gracefully if the snippet isn't a substring of the
 * chunk text (e.g. the engine lightly rephrased the quote) —
 * we then just wrap the snippet itself in <mark> with no
 * surrounding context.
 */
function renderHighlighted(text: string, snippet: string): ReactNode {
  const safeSnippet = (snippet ?? "").trim();
  if (!safeSnippet) return text;
  const idx = text.indexOf(safeSnippet);
  if (idx === -1) {
    return (
      <mark
        style={{
          background: "rgba(22,154,165,0.22)",
          color: "inherit",
          borderBottom: "1px solid rgba(22,154,165,0.45)",
          borderRadius: 3,
          padding: "0 2px",
        }}
      >
        {snippet}
      </mark>
    );
  }
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: "rgba(22,154,165,0.22)",
          color: "inherit",
          borderBottom: "1px solid rgba(22,154,165,0.45)",
          borderRadius: 3,
          padding: "0 2px",
        }}
      >
        {snippet}
      </mark>
      {text.slice(idx + snippet.length)}
    </>
  );
}

/* ============================================================
   SourcePreviewModal — controlled by parent (open + citation)
   ============================================================ */

export interface SourcePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  citation: SourceCitation | null;
  locale: "en" | "ar";
}

export function SourcePreviewModal({
  open,
  onOpenChange,
  citation,
  locale,
}: SourcePreviewModalProps) {
  const [doc, setDoc] = useState<PolicyDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch the parent policy doc whenever the modal opens with a
  // new citation. Cancel inflight requests on close / citation change.
  // The setState calls are deferred to a setTimeout(0) so they don't
  // fire synchronously inside the effect body (avoids the
  // react-hooks/set-state-in-effect cascading-render warning).
  useEffect(() => {
    if (!open || !citation) return;
    const c = citation;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setFetchError(null);
      setDoc(null);
      fetch(`/api/v1/policies/${c.docSlug}`)
        .then((r) => r.json())
        .then((json: ApiEnvelope<PolicyDoc>) => {
          if (cancelled) return;
          if (!json.ok || !json.data) {
            setFetchError(json.error?.message ?? "Couldn't open policy");
            return;
          }
          setDoc(json.data);
        })
        .catch(() => {
          if (!cancelled) setFetchError("Network error");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, citation]);

  // Note: we intentionally do NOT reset `copied` on close — the
  // copy handler's own setTimeout(1800) flips it back to false.
  // Adding a useEffect for that would trigger the
  // react-hooks/set-state-in-effect lint rule for no real benefit.

  // Find the matching section in the doc for the citation's
  // `section` + `lang`. Falls back to the first matching section
  // by `section` only (in case the lang codes don't match exactly).
  const matchingSection: PolicySection | null =
    citation && doc
      ? (doc.sections.find((s) => s.section === citation.section && s.lang === citation.lang) ??
        doc.sections.find((s) => s.section === citation.section) ??
        null)
      : null;

  const handleCopyCitation = async () => {
    if (!citation) return;
    const cite = `${citation.title} · §${citation.section} · effective ${citation.effectiveDate} · chunk ${citation.chunkId}`;
    try {
      await navigator.clipboard.writeText(cite);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success(locale === "ar" ? "تم نسخ الاستشهاد" : "Citation copied");
    } catch {
      toast.error(locale === "ar" ? "تعذّر النسخ" : "Couldn't copy");
    }
  };

  if (!citation) return null;

  const stale = isStale(citation.reviewDate);
  const isAr = citation.lang === "ar" || locale === "ar";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[680px] max-h-[88vh] overflow-hidden flex flex-col p-0"
        style={{
          /* Frosted-glass surface — .ast-card-glass equivalent.
             We inline the styles so the shadcn DialogContent
             (which uses bg-background by default) doesn't fight
             us with a solid navy fill. */
          background: "rgba(16, 24, 39, 0.66)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(22, 154, 165, 0.22)",
          color: "var(--text-hi)",
          boxShadow: "var(--e3)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        {/* Top accent — 2px teal gradient hairline, instrument signature */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background:
              "linear-gradient(90deg, transparent 0%, var(--brand-500) 30%, var(--brand-400) 70%, transparent 100%)",
            opacity: 0.7,
            pointerEvents: "none",
          }}
        />

        {/* Header */}
        <DialogHeader
          className="pr-10 px-5 pt-5 pb-3 border-b shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <DialogTitle
            className="flex items-start gap-2 text-[16px] font-semibold leading-snug"
            style={{ color: "var(--text-hi)" }}
            dir={isAr ? "rtl" : "ltr"}
          >
            <Sparkles
              className="w-4 h-4 shrink-0 mt-0.5"
              strokeWidth={1.75}
              style={{ color: "var(--accent-500)" }}
              aria-hidden="true"
            />
            <span className="flex-1">{citation.title}</span>
          </DialogTitle>
          <DialogDescription
            className="flex flex-wrap items-center gap-2 text-[11px] mt-1"
            style={{ color: "var(--text-lo)" }}
          >
            <span
              className="inline-flex items-center rounded-full font-mono tabular"
              style={{
                color: "var(--brand-400)",
                background: "rgba(22,154,165,0.10)",
                border: "1px solid rgba(22,154,165,0.30)",
                height: 22,
                paddingInline: 8,
                fontSize: 11,
              }}
            >
              §{citation.section}
            </span>
            <span
              className="inline-flex items-center gap-1 tabular"
              style={{ color: "var(--text-lo)" }}
            >
              <Clock className="w-3 h-3" strokeWidth={1.75} />
              {locale === "ar" ? "ساري منذ" : "Effective"}{" "}
              {format(new Date(citation.effectiveDate), "d MMM yyyy")}
            </span>
            <span
              className="inline-flex items-center gap-1 tabular"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? "يُراجع" : "Review"}{" "}
              {format(new Date(citation.reviewDate), "d MMM yyyy")}
            </span>
            {stale && (
              <span
                className="inline-flex items-center gap-1"
                style={{ color: "var(--status-watch)" }}
              >
                <AlertTriangle className="w-3 h-3" strokeWidth={1.75} />
                {locale === "ar" ? "يحتاج مراجعة" : "Stale"}
              </span>
            )}
            <span
              className="inline-flex items-center uppercase tracking-[0.12em] text-[10px] font-mono"
              style={{ color: "var(--text-lo)" }}
            >
              {citation.lang === "ar" ? "عربي" : "EN"}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Body — full chunk text with cited sentence highlighted */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="space-y-2" aria-hidden="true">
              <div className="h-3 w-3/4 ast-shimmer rounded" />
              <div className="h-3 w-1/2 ast-shimmer rounded" />
              <div className="h-3 w-2/3 ast-shimmer rounded" />
              <div className="h-3 w-5/6 ast-shimmer rounded" />
            </div>
          )}

          {!loading && fetchError && (
            <p className="text-[13px]" style={{ color: "var(--status-friction)" }} role="alert">
              {fetchError}
            </p>
          )}

          {!loading && !fetchError && matchingSection && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="text-[14px] leading-relaxed"
              style={{ color: "var(--text-mid)" }}
              dir={matchingSection.lang === "ar" ? "rtl" : "ltr"}
            >
              {renderHighlighted(matchingSection.text, citation.snippet)}
            </motion.p>
          )}

          {!loading && !fetchError && !matchingSection && citation.snippet && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="text-[14px] leading-relaxed"
              style={{ color: "var(--text-mid)" }}
              dir={isAr ? "rtl" : "ltr"}
            >
              {renderHighlighted(citation.snippet, citation.snippet)}
            </motion.p>
          )}

          {!loading && !fetchError && !matchingSection && !citation.snippet && (
            <p className="text-[13px]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar"
                ? "لا يوجد نص متاح لهذا المصدر."
                : "No source text available for this citation."}
            </p>
          )}
        </div>

        {/* Footer — Open full policy · Copy citation · Close */}
        <div
          className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-2 px-5 py-3 border-t shrink-0"
          style={{
            borderColor: "var(--border)",
            background: "rgba(11, 17, 28, 0.35)",
          }}
        >
          <a
            href={`/api/v1/policies/${citation.docSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-medium transition-colors hover:-translate-y-0.5"
            style={{
              color: "var(--brand-400)",
              background: "rgba(22,154,165,0.08)",
              border: "1px solid rgba(22,154,165,0.25)",
              textDecoration: "none",
            }}
          >
            <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
            {locale === "ar" ? "افتح السياسة كاملة" : "Open full policy"}
            <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
          </a>
          <button
            type="button"
            onClick={handleCopyCitation}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-medium transition-colors hover:bg-[var(--surface-3)]"
            style={{
              color: "var(--text-mid)",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            {copied ? (
              <Check
                className="w-3.5 h-3.5"
                strokeWidth={1.75}
                style={{ color: "var(--status-steady)" }}
              />
            ) : (
              <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
            {locale === "ar" ? "نسخ الاستشهاد" : "Copy citation"}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-medium transition-colors hover:bg-[var(--surface-3)] sm:ml-auto"
            style={{
              color: "var(--text-hi)",
              background: "transparent",
              border: "1px solid var(--border)",
            }}
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
            {locale === "ar" ? "إغلاق" : "Close"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
