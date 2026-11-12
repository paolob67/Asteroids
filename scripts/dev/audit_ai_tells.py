#!/usr/bin/env python3
"""Scans article markdown for the AI tells listed by the linkedin-humanizer skill (V3).

Per paragraph: counts density markers (3+ = rewrite, 2 = replace the weakest). Single-hit patterns
(reveal bridges, negative parallelism, staccato, sincerity markers, closers) are always reported.
Image lines, code fences, tables and link-only lines are skipped.

Usage: python3 scripts/dev/audit_ai_tells.py docs/articles/linkedin/part-1-legacy-to-modern.md [...]
"""
import re
import sys

VERBS = ("leverag", "utiliz", "facilitat", "streamlin", "delv", "navigat", "unlock", "harness",
         "foster", "cultivat", "elevat", "empower")
DENSITY = {
    "vocab_verbs": rf"\b(?:{'|'.join(VERBS)})(?:e|es|ed|ing|s)?\b",
    "vocab_2026": r"(?i)\b(significant(ly)?|crucial(ly)?|notably|particularly|comprehensive|insights?|robust|landscape|nuanced|multifaceted|holistic|seamless|ecosystem)\b",
    "adverb_filler": r"(?i)\b(fundamentally|essentially|ultimately|arguably|certainly|definitely|undoubtedly)\b",
    "ing_opener": r"(?m)^[\s>*\-]*[A-Z][a-z]+ing\b[^.\n]{0,60},",
    "nominalisation": r"(?i)\bthe \w+(?:tion|sion|ment|ance|ence|ization|isation) of\b",
    "linkedin_2026": r"(?i)\b(quietly|compound(s|ing)?|(a|the) signal|the work|built different|load-bearing|doing the heavy lifting)\b",
    "decaying_2024": r"(?i)\b(delve|delving|tapestry|realm|intricate|journey|paradigm)\b",
}
SINGLE = {
    "en_dash": "\u2013",
    "double_dash": r"--",
    "reveal_bridge": r"(?im)^(the (result|outcome|answer|lesson|catch|kicker|truth)\?|here'?s (what|how|why|the thing)\b|stop \w+[^.\n]{0,40}[.,] ?start \b|plot twist:)",
    "neg_parallel": r"(?i)\b(isn'?t|not) (about |just )?[^,.\n]{1,40}, (but )?it'?s (about )?\b|\bnot just \w+, it'?s",
    "staccato_stack": r"(?m)^(\w+\. ){2,}\w+\.$",
    "one_word_paragraph": r"(?m)^\w+\.$",
    "no_no_just": r"(?i)\bno \w+[.,] no \w+[.,] (just|only) \w+",
    "pseudo_socratic": r"(?i)\b(why|how)\? (because|simple)\b",
    "sincerity_marker": r"(?i)\b(let me be (honest|real|direct|clear)|i'?ll be (honest|real|direct)|honestly\?|to be (direct|honest|transparent)|real talk|full transparency|not gonna lie|unpopular opinion)\b",
    "opener_filler": r"(?i)(in today's|have you ever|most people don't realize|here's a hard truth)",
    "closer_filler": r"(?i)(what do you think\?|thoughts\?|agree or disagree\?|let me know in the comments|tag someone|let that sink in|that'?s the real story)",
    "cliche": r"(?i)\b(game-changer|deep dive|move the needle|paradigm shift|testament to|at the end of the day|the (harsh|hard|uncomfortable) (truth|reality) is)\b",
    "hedge": r"(?i)\b(perhaps|it seems|might be wrong)\b",
}


def paragraphs(text):
    out, in_code = [], False
    for block in re.split(r"\n\s*\n", text):
        lines = []
        for ln in block.split("\n"):
            if ln.strip().startswith("```"):
                in_code = not in_code
                continue
            if in_code or ln.strip().startswith(("![", "|", "#", "---", "*Video file", "Editable source", "Code source")):
                continue
            lines.append(ln)
        p = "\n".join(lines).strip()
        if p:
            out.append(p)
    return out


def triads(par):
    return re.findall(r"\b[\w`]+(?: [\w`]+)?, [\w`]+(?: [\w`]+)?,? and [\w`]+(?: [\w`]+)?", par)


def main(paths):
    for path in paths:
        text = open(path, encoding="utf-8").read()
        pars = paragraphs(text)
        words = len(" ".join(pars).split())
        print(f"\n=== {path}: {len(pars)} paragraphs, {words} words")
        print(f"em dashes: {text.count(chr(0x2014))} (cap about {max(1, min(2, round(words / 100)))} per post; project rule: none)")
        frag = sum(1 for p in pars for s in re.split(r"(?<=[.!?])\s+", p) if 0 < len(s.split()) < 4 and not s.startswith(("-", "1", "2", "3", "4", "5", "6", "*")))
        tri = sum(len(triads(p)) for p in pars)
        print(f"short fragments (<4 words): {frag}; triad candidates: {tri}")
        for i, p in enumerate(pars, 1):
            hits = []
            for name, pat in DENSITY.items():
                hits += [(name, m.group(0)) for m in re.finditer(pat, p)]
            single = []
            for name, pat in SINGLE.items():
                single += [(name, m.group(0)) for m in re.finditer(pat, p)]
            if len(hits) >= 2 or single:
                action = "REWRITE" if len(hits) >= 3 else "replace weakest" if len(hits) == 2 else "single-hit"
                print(f"- para {i} [{action}] {p[:70]!r}")
                for h in hits + single:
                    print(f"    {h[0]}: {h[1]!r}")


if __name__ == "__main__":
    main(sys.argv[1:])
