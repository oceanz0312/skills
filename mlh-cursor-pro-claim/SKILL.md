---
name: mlh-cursor-pro-claim
description: 通过报名 MLH Global Hack Week（如 Hacktoberfest）活动并完成 check-in，领取赞助商送的免费 Cursor Pro。当用户发来 MLH / Global Hack Week 送 Cursor Pro 的推文或链接、想报名领取、或问 Cursor Pro 兑换码在哪时使用。
---
# 通过 MLH Global Hack Week 领取免费 Cursor Pro

MLH 的 Global Hack Week（GHW）线上活动会附带赞助商福利，比如 Cursor Pro。**流程是：注册 MyMLH 账号 → 填资料 → 勾同意条款 → 活动 check-in → 等 MLH 邮件发兑换码 → 在 Cursor 里兑换。** 网页上不会直接给码。

## 适用前提
- 活动正在进行（查看活动页上的日期，例如 Hacktoberfest 周）。
- **不要求是学生**。非学生也能报名，"是否学生 / 学校" 按真实情况填。
- 需要一个能收邮件的邮箱（MyMLH 用邮箱一次性验证码登录，兑换码也发到这个邮箱）。
- 码的发放资格可能收紧：活动中后期若出现刷号，MLH 可能把 Cursor 码限制给「已有社区成员」（老账号），新账号需等官方后续通知。

## 开始前先跟用户要的信息（全部用用户给的真实值，不要编）
| 字段 | 占位 |
|---|---|
| 报名邮箱 | `<EMAIL>` |
| 姓名 | `<FIRST_NAME> <LAST_NAME>` |
| 出生日期 / 年龄 | `<BIRTHDATE>` |
| 国家 / 地区 | `<COUNTRY>`、`<REGION>`（例如 Asia Pacific / APAC） |
| 性别、族裔等人口统计项 | `<GENDER>`、`<ETHNICITY>`（可选"不愿透露"时让用户自己选） |
| 是否学生、学校、学历 | `<STUDENT_STATUS>` |
| 从哪得知活动 | `<HEARD_FROM>`（例如 Twitter / X） |
| 社交账号（若表单要） | `<SOCIAL_HANDLE>` |
| 是否要 GitHub Student Pack | `<YES/NO>`（非学生选 No） |

一次性问全，缺哪项就问哪项；**不要替用户猜**。

## 步骤
1. **找活动入口**：从用户给的推文 / 链接进入 MLH 活动页（`https://www.mlh.com/events/...`），确认有 Cursor Pro 的 challenge（标题类似 "Sign up for a Cursor Pro Account"），记下官方兑换说明。
2. **登录 MyMLH**：用 `<EMAIL>` 登录或注册。MLH 会发一次性登录码到邮箱，让用户提供，或在已授权的邮箱连接里读取（只读这一封）。
3. **填个人资料与人口统计（demographics）**：按上表逐项填写用户给的值，保存后**刷新页面确认真的保存了**。
4. **同意条款（consents）**：
   - 必选项（MLH Code of Conduct、隐私政策 / 条款等）**必须由用户本人勾选**。
   - 可选项（订阅 MLH 邮件、向赞助商 / 合作方共享信息）默认不勾，除非用户明确要求。
   - Student Pack 按用户选择（非学生一般 No）。
5. **活动 check-in**：回到活动页点 check-in / RSVP，看到 **"You are checked in!"** 即报名成功。通常同时会收到一封 "You have just been checked in to Global Hack Week: ..." 的邮件。
6. **完善账号（提高领码成功率）**：在 MyMLH 完成**手机号验证**、**连接 GitHub**；邮件里的 swag / challenge 列表常把这两项列为领取伙伴福利的前置。
7. **用官方 claim 链接自查资格**：日更邮件（如 Day 5）会说明是否因反刷号收紧发放，并给出 "claim your code" 链接。点开后看是否可领；**不要为领不到码去提 MLH 支持工单**（官方可能明确要求不要提）。
8. **等兑换码 / 搜邮箱**：Cursor Pro promo code 由 MLH **发到报名邮箱**（可能晚于 check-in）。搜 `from:mlh.io (Cursor OR promo OR code)`。注意：同一封 "partner offers / Claim your promo code" 邮件里可能混有**其他赞助商**（例如 SpaceXAI），点进去不是 Cursor 码时不要当成失败结论。
9. **兑换**：登录 Cursor → Settings → **Billing & Invoices**，手动升到 Pro 并输入 code（challenge 说明常强调要在 Billing 里手动升级）。

## 卡点与解决
| 卡点 | 现象 | 解决 |
|---|---|---|
| 安全表单填写没保存 | 通过 Secure Form 收集的人口统计字段提交后页面还是空的 | 让用户把浏览器（box）交给 agent，由浏览器子代理按**用户刚给的值**直接在页面上填并保存，再刷新核对 |
| 群聊里没法操作 | 群聊不能交接浏览器、不能弹安全表单 | 把报名转到与该 bot 的 **1:1 私聊**里继续 |
| 以为要学生身份 | 页面出现学校 / Student Pack 等字段 | 不要求学生；按真实情况填，Student Pack 选 No |
| check-in 后没看到码 | 网页上没有兑换码 | 正常，码由 MLH 后续邮件 / claim 页发放，等待并搜邮箱 |
| 登录要验证码 | MyMLH 邮箱一次性码 | 让用户提供或读取最新那封验证码邮件 |
| 新账号领不到码 | Day N 邮件写 codes restricted to existing MLH community members / 反刷号 | 先完成手机验证 + GitHub 绑定，用 claim 链接自查；若仍无资格，等官方后续开放，**不要提工单** |
| Claim 链接不是 Cursor | 点 "Claim promo" 进了其他赞助商（如 SpaceXAI） | 回到 Cursor challenge 页或日更邮件里的 Cursor 专用 claim / challenge 链接再试 |
| 有码但没生效 | 输入 code 后仍是 Free | 在 Billing & Invoices **手动升级到 Pro** 再填 code |

## Agent 禁止事项
- **不编造任何个人信息**（生日、性别、族裔、学校、社交账号等），缺就问。
- **不替用户勾选同意条款**，必选项让用户自己点；可选的营销 / 共享项不主动勾。
- 不把用户的邮箱、验证码、兑换码、token 写进文件、日志或公开内容。
- 群聊里不要尝试交接浏览器或弹表单，转 1:1。
- 不承诺一定到码：码的发放时间和资格以 MLH / Cursor 官方为准。
- 不替用户向 MLH 开 support ticket 催 Cursor 码（官方可能要求勿开）。
