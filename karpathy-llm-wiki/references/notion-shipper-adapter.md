# Notion (Shiper) path adapter

Upstream skill expects a filesystem wiki under the project root. Young's live knowledge base is the Shiper Notion space. When operating there, keep **every Ingest / Query / Lint rule in SKILL.md unchanged**, and only remap storage:

| Upstream | Shiper Notion |
| --- | --- |
| `raw/<topic>/YYYY-MM-DD-slug.md` | page under `05 Raw 原始资料` (immutable body; metadata header as in `raw-template.md`) |
| `wiki/<topic>/<article>.md` | wiki article under PARA (`01`–`04`, `99`); one concept one page |
| `wiki/index.md` | [索引](<NOTION_PAGE_URL>) |
| `wiki/log.md` | [操作日志](<NOTION_PAGE_URL>) |
| Schema | this skill + [知识库规则](<NOTION_PAGE_URL>) for PARA placement |

Also: new sources still stage in **Inbox** first (existing Shiper rule), then land in Raw and compile to wiki.

Connector: `user-Notion--shipper`. Prefer Notion page mentions for internal links. `scripts/check_evidence.py` applies when raw/wiki live as files; on Notion, apply the same Grounding Invariant by fetching the linked Raw page before writing load-bearing facts, and report (do not invent) when a literal cannot be located.

Do not weaken triage (New / Update / Disputed / No material), cascade updates, Status blocks, or log formats from SKILL.md.
