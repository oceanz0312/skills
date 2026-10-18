---
name: notion-llm-wiki
description: >-
  Use when ingesting sources into Young's Shiper Notion knowledge base, answering
  from it, or health-checking it. Triggers: add to knowledge base, LLM wiki,
  Karpathy wiki, ingest, lint the wiki, or any durable knowledge filing into Notion.
---

# Notion LLM Wiki (Karpathy pattern)

Maintain the Shiper Notion space as a persistent, compounding wiki. The LLM writes and maintains pages; the human curates sources and asks questions. Do not re-derive knowledge from scratch on every question — compile once, keep current.

Canonical idea: [Karpathy llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

## Architecture (mapped to Notion)

| Layer | Notion home | Rules |
| --- | --- | --- |
| **Raw** | `05 Raw 原始资料` | Immutable sources. Store the original URL, clip, PDF, or paste. Never rewrite a raw page to “clean it up” after ingest — only append metadata if needed. |
| **Wiki** | `01 Projects` · `02 Areas` · `03 Resources` · `04 Decisions` · `99 归档` | Compiled knowledge. Entity pages, concept pages, summaries, comparisons. Cross-link heavily. |
| **Index** | page `知识库索引` (under Shiper hub) | Content catalog: every wiki page with one-line summary + optional source count. Update on every ingest. |
| **Log** | page `操作日志` | Append-only. Prefer `## [YYYY-MM-DD] ingest \| Title` (or `query` / `lint`). |
| **Schema** | this skill | Conventions and workflows for future sessions. |

Hub: Shiper 知识库. Connector namespace for this space: `user-Notion--shipper` (adjust if the user’s active Notion account differs).

PARA placement: pick the shallowest fitting bucket, then the closest existing parent. Prefer a child page under an existing section over a new top-level page.

## Operations

### Ingest

1. **Capture raw.** Create or locate a page under `05 Raw` with the source as-is (URL, title, date captured, optional full text or attachment). Do not polish the raw body.
2. **Triage with the user** when the ask is ambiguous (what to emphasize, which entities matter). Prefer one source at a time.
3. **Compile into wiki.** Write or update:
   - a summary / entity page in the right PARA section
   - related concept or company pages touched by the same facts
   - cross-links both ways where useful
4. **Grounding.** Load-bearing facts (numbers, dates, quotes) must appear in the linked raw source. Prefer citing the raw page and the original URL on the wiki page.
5. **Update index.** Add or refresh the row in `知识库索引` (link + one-line summary + date).
6. **Append log.** One entry on `操作日志`: what was ingested, which pages were created/updated.
7. **Report.** Give the user the wiki page link(s) and what changed — not a dump of the raw source.

A single source may touch many pages. Do not stop after creating only one leaf page if entity or concept pages need updates.

### Query

1. Read `知识库索引` first (or search Notion) to find candidate pages.
2. Fetch those pages; answer with citations (Notion page links).
3. If the answer is durable (comparison, synthesis, decision), **file it back** as a new wiki page, update the index, and log the query — explorations should compound.

### Lint (periodic health check)

Look for and report (auto-fix only the safe structural ones):

- contradictions between pages
- stale claims superseded by newer sources
- orphan pages (no inbound links / not in index)
- important concepts mentioned but lacking a page
- missing cross-references
- broken Notion mentions or dead external links you can verify
- raw pages never compiled, or wiki claims with no raw backing

Ask before large reorganizations or deletions.

## Page conventions

- Lead with a short purpose blurb or one-line summary when useful.
- Prefer targeted Notion `update_content` edits over full-page `replace_content`.
- Use native Notion page mentions for internal links when the tool supports them; otherwise use the page URL.
- Company research under `03 Resources / 软件&SaaS公司调研` (one child page per company) unless the user places it elsewhere.
- Design language / style references under `03 Resources / 设计语言 Design Language`.
- Personal follow-reasons and content reflection under `01 Projects / AI 自媒体 / 自媒体感悟：我为什么关注 TA` (split by platform).

## Anti-patterns

- Dropping a polished page into Resources and skipping Raw, Index, and Log.
- Rewriting history inside a raw page.
- Answering from chat memory without reading wiki pages when the knowledge should already live in Notion.
- Creating duplicate entity pages instead of updating the existing one.

## Optional bootstrap

If `知识库索引` is missing, create it under the Shiper hub on the first ingest and seed it from major existing sections — do not invent summaries for pages you have not fetched.
