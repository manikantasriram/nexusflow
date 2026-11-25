"""Document intelligence without a language model: plain, explainable text statistics.

- keywords: the most frequent meaningful words (stop words removed);
- summary: the 3 sentences that contain the most of those keywords, in their original order
  (classic extractive summarisation, scored per word so long sentences don't always win);
- action items: lines written as to-dos ("- [ ] ...", "TODO: ...", "Action: ...").

All functions here are pure, so they are easy to unit test.
"""

import io
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.errors import AppError

TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".log"}
MAX_PDF_PAGES = 200

STOPWORDS = frozenset(
    """a about above after again against all also am an and any are as at be because been before being
    below between both but by can could did do does doing done down during each etc few for from
    further get got had has have having he her here hers him his how i if in into is it its just let
    like may me might more most must my no nor not now of off on once one only or other our ours out
    over own per same she should so some such than that the their theirs them then there these they
    this those through to too two under until up upon us very via was we were what when where which
    while who whom why will with within without would yes yet you your yours""".split()
)

_WORD = re.compile(r"[A-Za-z][A-Za-z'\-]*[A-Za-z]")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])")
_MARKUP = re.compile(r"^\s*(?:#{1,6}\s+|[-*+•]\s+|\d+[.)]\s+|>\s*)")
_ACTION = re.compile(
    r"^\s*(?:[-*+•]\s*)?(?:\[\s?\]\s*|todo\b[:\s\-]*|action(?:\s+items?)?\s*[:\-]\s*|ai\s*[:\-]\s*)(?P<item>\S.*)$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Analysis:
    word_count: int
    keywords: list[str]
    summary: str
    action_items: list[str]


def extract_text(filename: str, content_type: str, data: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf" or content_type == "application/pdf":
        if not data.startswith(b"%PDF"):
            raise AppError(422, "That file isn't a valid PDF", code="validation_error")
        try:
            reader = PdfReader(io.BytesIO(data))
            pages = reader.pages[:MAX_PDF_PAGES]
            return "\n".join(page.extract_text() or "" for page in pages)
        except (PdfReadError, ValueError, KeyError) as exc:
            raise AppError(422, "Couldn't read text from that PDF", code="validation_error") from exc
    if ext in TEXT_EXTENSIONS or content_type.startswith("text/"):
        return data.decode("utf-8", errors="replace")
    raise AppError(415, "Upload a .txt, .md, .csv or .pdf file")


def _words(text: str) -> list[str]:
    return [w.lower() for w in _WORD.findall(text)]


def _sentences(text: str) -> list[str]:
    """Splits prose into sentences. A paragraph wrapped over several lines stays one paragraph;
    headings and bullets are blocks of their own, so they never merge into the next sentence."""
    blocks: list[str] = []
    paragraph: list[str] = []

    def end_paragraph() -> None:
        if paragraph:
            blocks.append(" ".join(paragraph))
            paragraph.clear()

    for line in text.splitlines():
        if _ACTION.match(line):
            end_paragraph()  # to-dos are listed separately; they make poor summary sentences
            continue
        stripped = line.strip()
        if not stripped:
            end_paragraph()
        elif _MARKUP.match(line):
            end_paragraph()
            blocks.append(_MARKUP.sub("", line).strip())
        else:
            paragraph.append(stripped)
    end_paragraph()

    flat = " ".join(b if b[-1] in ".!?:" else b + "." for b in blocks if b)
    return [s.strip() for s in _SENTENCE_END.split(flat) if len(s.strip()) > 20]


def action_items(text: str, limit: int = 20) -> list[str]:
    items: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        m = _ACTION.match(line)
        if not m:
            continue
        item = m.group("item").strip().rstrip(".")[:200]
        if item and item.lower() not in seen:
            seen.add(item.lower())
            items.append(item)
        if len(items) >= limit:
            break
    return items


def analyze(text: str, n_keywords: int = 8, n_sentences: int = 3) -> Analysis:
    words = _words(text)
    counts = Counter(w for w in words if len(w) >= 3 and w not in STOPWORDS)
    keywords = [w for w, _ in counts.most_common(n_keywords)]

    sentences = _sentences(text)
    weights = dict(counts.most_common(25))

    def score(sentence: str) -> float:
        ws = _words(sentence)
        return sum(weights.get(w, 0) for w in ws) / math.sqrt(len(ws) + 1)

    best = sorted(range(len(sentences)), key=lambda i: score(sentences[i]), reverse=True)[:n_sentences]
    summary = " ".join(sentences[i][:400] for i in sorted(best))

    return Analysis(
        word_count=len(words),
        keywords=keywords,
        summary=summary,
        action_items=action_items(text),
    )
