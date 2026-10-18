---
name: notion-llm-wiki
description: >-
  Use when ingesting sources into Young's Shiper Notion knowledge base, answering
  from it, or health-checking it. Triggers: add to knowledge base, LLM wiki,
  Karpathy wiki, ingest, lint the wiki, or any durable knowledge filing into Notion.
---

# Notion LLM Wiki (Karpathy pattern)

Maintain the Shiper Notion space as a persistent, compounding wiki. The LLM writes and maintains pages; the human curates sources and asks questions. Compile once, keep current — do not re-derive from scratch on every question.

Canonical idea: [Karpathy llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

**In Notion, the live schema page is authoritative:** [知识库规则](<NOTION_PAGE_URL>). This skill implements Karpathy's Ingest / Query / Lint on top of that page. If this skill and 知识库规则 disagree on PARA placement or naming, follow 知识库规则 and then update this skill.

## Architecture (mapped to existing Notion pages)

| Layer | Notion home | Role |
| --- | --- | --- |
| **Inbox** | Inbox (under Shiper hub) | Staging for any new source before filing |
| **Raw** | `05 Raw 原始资料` | Immutable sources kept as-is after filing |
| **Wiki** | `01 Projects` · `02 Areas` · `03 Resources` · `04 Decisions` · `99 归档` | Compiled knowledge pages |
| **Index** | [索引](<NOTION_PAGE_URL>) | Content catalog; update on every ingest |
| **Log** | [操作日志](<NOTION_PAGE_URL>) | Append-only history |
| **Schema** | [知识库规则](<NOTION_PAGE_URL>) + this skill | Conventions |

Hub: Shiper 知识库. Prefer connector `user-Notion--shipper`.

PARA: one home per page; cross-link with page mentions, never copy. Prefer child under an existing section over a new top-level page.

## Operations

### Ingest

1. **Inbox first.** Put the new source into Inbox (URL, title, capture date, optional full text/attachment).
2. **Keep a raw copy.** File the immutable source under `05 Raw` (or leave a clear raw child under the wiki topic if the schema page already defines that pattern). Do not polish raw after the fact.
3. **Triage** with the user when emphasis is ambiguous. Prefer one source at a time.
4. **Compile into wiki.** Create/update the entity or concept page in the correct PARA section; update related pages; add cross-links.
5. **Grounding.** Numbers, dates, and quotes on wiki pages must appear in the linked raw/source.
6. **Update [索引](<NOTION_PAGE_URL>).** Link + one-line summary + date.
7. **Append [操作日志](<NOTION_PAGE_URL>).** Prefer `## [YYYY-MM-DD] ingest | Title` listing pages created/updated.
8. **Clear Inbox** for that item once filed.
9. **Report** wiki page links and what changed.

One source may touch many wiki pages — do not stop after a single leaf page if related entities need updates.

### Query

1. Read 索引 (or Notion search) to find candidates.
2. Fetch pages; answer with Notion citations.
3. Durable answers (comparisons, synthesis, decisions) get filed back as wiki pages; update 索引 and 操作日志.

### Lint

Periodically health-check:

- contradictions; stale claims; orphans / missing from 索引
- concepts mentioned but lacking a page; missing cross-links
- raw never compiled; wiki claims with no raw backing
- broken links you can verify

Auto-fix only safe structural index/link drift. Ask before large moves or deletes.

## Conventions (current space)

- Company research → `03 Resources / 软件&SaaS公司调研` (one child per company)
- Design language → `03 Resources / 设计语言 Design Language`
- Follow-reasons / content reflection → `01 Projects / AI 自媒体 / 自媒体感悟：我为什么关注 TA`
- Prefer targeted `update_content` over full-page replace
- Do not delete content; move to `99 归档` when retired
- `04 Decisions` only after human confirmation

## Anti-patterns

- Polished wiki page with no Inbox/Raw/Index/Log pass
- Rewriting history inside a raw page
- Answering from chat memory when the fact should already live in the wiki
- Duplicate entity pages instead of updating the existing one
- Skipping Inbox and scattering pages at the hub root
