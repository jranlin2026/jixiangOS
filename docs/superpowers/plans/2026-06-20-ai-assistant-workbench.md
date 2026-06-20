# AI Assistant Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn AI助手 into an operations workbench that surfaces CRM risks, suggested actions, and data-backed answers.

**Architecture:** Add a small AI aggregation layer on top of existing mock/localStorage CRM data, then render it as a two-column workbench plus chat analysis page. Keep all actions as internal route links and reuse existing AI result rendering patterns.

**Tech Stack:** React, TypeScript, Zustand, MUI, Recharts, localStorage mock APIs.

---

### Task 1: Data Model And API

**Files:**
- Modify: `src/types/ai.ts`
- Modify: `src/api/aiApi.ts`

- [x] Add workbench types for metrics, task cards, insight cards, and prompt templates.
- [x] Add `fetchAssistantWorkbench()` to aggregate leads, customers, orders, order applications, refunds, commissions, and upgrade opportunities.
- [x] Rewrite rule-based AI answers to use current system data instead of fixed placeholder numbers.

### Task 2: Store And Rendering

**Files:**
- Modify: `src/store/useAIStore.ts`
- Modify: `src/pages/AIAssistant/AIResultRenderer.tsx`

- [x] Load the workbench payload alongside sessions.
- [x] Render action buttons from AI results so suggestions can jump to the right module.
- [x] Keep chart, table, text, and suggestion rendering compatible with existing messages.

### Task 3: AI Assistant Page

**Files:**
- Modify: `src/pages/AIAssistant/index.tsx`

- [x] Replace the plain chat layout with `运营体检 + 智能任务 + 模板问题 + 会话分析`.
- [x] Use icons, compact cards, tabs, and route actions consistent with the rest of the CRM.
- [x] Preserve existing chat history and new-chat behavior.

### Task 4: Verification

**Files:**
- No source files unless build/browser checks reveal issues.

- [x] Run `npm run build`.
- [x] Browser-check `/ai-assistant`, submit one recommended prompt, and verify result cards and navigation affordances.
- [x] Smoke-check core changed routes if build succeeds.
