# 计量字段与查询模板

建账（SOP 第 1 步）和诊断（第 2 步）要用到的最小数据面。表名、字段名只是示意，换成自己系统里的即可。

## 每次模型调用一行（`llm_call`）

| 字段                                                                              | 说明                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `call_point`                                                                      | 调用点：`plan` / `sandbox` / `check` / `tts` / `research` …                     |
| `conversation_id`, `job_id`, `attempt_id`                                         | 归属到哪部片子、哪次尝试                                                        |
| `step`                                                                            | 哪一步，例如 `segment:shot-3`、`check`、`sound`。沙箱里的调用可以经请求头带出来 |
| `tool_calls`                                                                      | 这次回复里调了哪些工具，用来给返工按原因归类                                    |
| `input_tokens`, `cache_write_5m`, `cache_write_1h`, `cache_read`, `output_tokens` | 取自响应的 `usage`，原样记                                                      |
| `cost_micro_usd`                                                                  | 按**官方价目**算的成本，和对用户的计价分开存                                    |
| `status`, `created_at`, `settled_at`                                              | 断开、未结算的调用要能单独查出来                                                |

另外两类数据：

- 任务事件流：排队、各段开始和交付、暂停、续做、结束，用来算每一步的耗时。
- 成片时长。

## 查询模板

一部片子的调用明细：

```sql
select call_point, step, input_tokens, cache_write_5m, cache_write_1h, cache_read,
       output_tokens, cost_micro_usd, created_at
from llm_call
where job_id = :job or (conversation_id = :conv and job_id is null)
order by created_at;
```

每部成片的成本拆分（规划成本按同一对话里的任务数平摊）：

```sql
with sb as (
  select job_id, count(*) n, sum(cost_micro_usd) usd,
         sum(cache_write_5m) w5, sum(cache_write_1h) w1, sum(cache_read) r, sum(output_tokens) o
  from llm_call where call_point = 'sandbox' group by job_id),
cv as (
  select conversation_id,
         sum(case when call_point in ('plan','research') then cost_micro_usd else 0 end) plan_usd,
         sum(case when call_point = 'tts' then cost_micro_usd else 0 end) tts_usd
  from llm_call where job_id is null group by conversation_id),
nj as (select conversation_id, count(*) k from job group by conversation_id)
select j.id, w.duration_ms, json_array_length(j.input, '$.shots') shots,
       sb.n, sb.usd, cv.plan_usd / nj.k plan_usd, cv.tts_usd / nj.k tts_usd
from job j join sb on sb.job_id = j.id
left join work w on w.job_id = j.id
left join cv on cv.conversation_id = j.conversation_id
left join nj on nj.conversation_id = j.conversation_id
where j.status = 'succeeded';
```

跨段缓存是否命中（每段第一次调用应读到约等于共用前缀的长度）：

```sql
select step, min(created_at) first_at, cache_read, cache_write_5m
from llm_call where job_id = :job and step like 'segment:%'
group by step having created_at = min(created_at);
```

## 用会话日志补账本上线前的基线

agent 运行时的事件流（每段一个 `jsonl`）里，每条 assistant 消息结束时都带一份 `usage`，里面有输入、输出、缓存读、缓存写入，1 小时写入单独列出，还有模型名。做法：

1. 只累加 `role = assistant` 的 `message_end` 事件。1 小时写入单独拿出来，`缓存写入 − 1 小时写入` 就是 5 分钟写入。按模型名分开，乘各自的官方单价。
2. 先对账：拿一部账本上线后的片子，比对日志算出的成本和账本，差额应该只有日志外的调用（探活、平台侧检查）。
3. 对得上，再批量算账本上线前的片子；只用和现在同一个模型的样本。早期如果用过别的模型制作，单独列出，不混进基线。
4. 规划 agent 如果不在沙箱里跑，它的用量通常不在这份日志里，要另找来源；找不到就如实写明缺口。

## 诊断时要算的数

- 线性拟合：`总成本 = a + b × 成片秒数`，再加一列按段数的拟合。
- 每镜调用次数、每镜秒数、每镜成本、每次调用成本。
- 制作 token 成本的构成：输入、5 分钟写、1 小时写、读、输出各占多少（按官方单价乘 token 数）。
- 返工按打回原因归类：按 `tool_calls` 和失败提示分到首稿、看图返工、画面不动、自检各类、调用格式错。
- 失败和没做完的片子：花了多少、卡在哪一步。注定做不成的那部分花费，就是止损的空间。
