from __future__ import annotations
import json, re, zipfile
from collections import defaultdict
from pathlib import Path
from .crawler import Page

def slug(text: str) -> str:
    return (re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80] or "page")

def compile_skill(name: str, start_url: str, pages: list[Page], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = out_dir / f"{slug(name)}.zip"
    groups, used, filenames = defaultdict(list), defaultdict(int), {}
    for i, p in enumerate(pages, 1):
        base = slug(p.title); used[base] += 1
        suffix = f"-{used[base]}" if used[base] > 1 else ""
        filenames[p.url] = f"{i:04d}-{base}{suffix}.md"
        groups[p.kind].append(p)
    skill_md = f"""---
name: {slug(name)}
description: Knowledge skill generated from {start_url}
---
# {name}

## Purpose
Use this captured knowledge to answer, plan, troubleshoot and implement tasks grounded in the original sources.

## Operating rules
1. Start with `knowledge/index.md`.
2. Read relevant captured pages before implementation guidance.
3. Prefer documented procedures, constraints, warnings, examples and commands.
4. Separate source facts from inference.
5. Verify live sources for changing facts.
6. Preserve source URLs when traceability matters.

## Workflow
Understand → Retrieve → Decide → Execute → Verify

Captured pages: {len(pages)}
Source root: {start_url}
"""
    index = ["# Knowledge Index", ""]
    for kind in sorted(groups):
        index += [f"## {kind}", ""]
        for p in groups[kind]:
            index.append(f"- [{p.title}](pages/{filenames[p.url]}) — {p.url}")
        index.append("")
    sources = [{"title":p.title,"url":p.url,"type":p.kind,"words":p.words} for p in pages]
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("SKILL.md", skill_md)
        z.writestr("knowledge/index.md", "\n".join(index))
        z.writestr("sources/sources.json", json.dumps(sources, ensure_ascii=False, indent=2))
        z.writestr("metadata.json", json.dumps({"generator":"SkillForge Docs 0.4","name":name,"start_url":start_url,
                   "pages":len(pages),"words":sum(p.words for p in pages)}, ensure_ascii=False, indent=2))
        for p in pages:
            z.writestr(f"knowledge/pages/{filenames[p.url]}", f"# {p.title}\n\n- Source: {p.url}\n- Type: {p.kind}\n\n{p.markdown}\n")
    return zip_path
