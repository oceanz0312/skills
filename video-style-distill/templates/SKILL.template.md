---
name: <slug>
description: <一句话：什么风格的竖屏/横屏视频生成器（HTML Canvas + Playwright + FFmpeg）+ 核心视觉特征 + 触发说法（"做成 xx 风""xx 那种视频"）+ 适用场合>
---

# <风格中文名> · 视频生成器（<slug> v1）

一次渲染 = manifest（素材 + BGM）+ 故事板 plan.json（agent 根据用户描述写）+ seed。同 plan 同 seed 逐像素复现。

## ⛔ P0 硬规则（逐帧审计，违反即 FAIL）
| 规则 | 内容 | 怎么保证（代码位置 / QA 检查） |
|---|---|---|
| P0-1 … | 来自用户反馈的每一条"绝对不许" | 审计函数 + qa 检查名 |

## 🔒 硬锁（节奏，故事板和 seed 都不能改）
- 主时钟 T = <x>s（换 BGM 时按 references/rhythm.md 推，范围 <a–b>）；所有事件落在网格上
- 场景长度 = <n>T；boil <k> 态；运动方式 <定格/连续>
- <结构签名：开场、唯一硬切、首尾呼应……（锁定包才锁）>

## 🎚 可调默认（有容差，故事板可改，seed 在容差内随机）
| 维度 | 默认 | 容差 |

## 谁决定什么（故事板 vs seed）
| 维度 | 故事板（agent 写） | seed |

## 文件地图
| 什么时候读 | 文件 |

## 工作流程
1. 读 prompt + 素材 → 2. 素材预处理（抠图等）+ validate_manifest → 3. 写 plan.json → validate_plan（REJECT 先改）
4. 渲染 `python render/run.py ...`（退出码：2 字形缺失 / 3 P0 违规）→ ffmpeg 合成
5. QA `python scripts/qa.py out.mp4 ...`（失败退出码 1）+ 自己看 qa_sheet → 6. 迭代（改故事板，seed 只换细节）

## 签名（必须保留）｜反模式（出现就不像原作者）

## 字体（全部可商用 / OFL）

## 已知限制（诚实写）
