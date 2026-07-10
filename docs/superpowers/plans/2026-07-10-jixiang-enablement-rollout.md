# Jixiang Enablement Platform Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Jixiang company enablement platform as four independently testable increments, starting with an authoritative knowledge publication foundation and ending with the complete new-hire onboarding loop.

**Architecture:** Keep enablement inside the existing JixiangOS repository as a server-authoritative modular domain with dedicated Prisma tables, `/api/enablement` routes, `/enablement` pages, and reusable AI interfaces. Reuse current authentication, users, departments, roles, MySQL, and DeepSeek configuration; do not store enablement business state in localStorage, `AppStorage`, or `BusinessRecord`.

**Tech Stack:** React 18, TypeScript, MUI 6, Zustand, Express 5, Prisma 6.19.3, MySQL 8.4, DeepSeek chat completion API, Node test scripts executed through `tsx`.

## Global Constraints

- Product boundary: one JixiangOS product and repository; enablement remains a separate domain under `/enablement` and `/api/enablement`.
- Audience: internal employees only; no agent, service-provider, customer, tenant, or public access in this rollout.
- Source of truth: WPS/Obsidian authors content; JixiangOS publishes immutable versions and owns runtime learning records.
- Governance: department managers approve content; users with knowledge-publish permission activate or retire versions.
- Data authority: all enablement mutations run on the server and commit to typed MySQL tables.
- Permission order: authenticate, load resource, enforce capability and data scope, validate state, mutate, audit.
- AI safety: permission filtering happens before knowledge is sent to DeepSeek; AI cannot approve content or pass a learner.
- Degradation: knowledge reading, learning, exams, tasks, and supervisor reviews remain usable when AI is unavailable.
- Compatibility: do not alter the existing AI Assistant product behavior while adding the AI Mentor domain.
- Concurrent architecture work: follow `docs/superpowers/specs/2026-07-10-core-business-architecture-refactor-design.md`; never introduce new localStorage or generic storage dependencies.
- Preserve unrelated worktree changes, especially `src/pages/Customers/index.tsx`, `.local/`, `.recovery/`, and `src/api/customerReleaseListScopeStatic.test.ts`.

---

## Delivery Sequence

### Increment 1: Authoritative Knowledge Foundation

**Detailed plan:** `docs/superpowers/plans/2026-07-10-jixiang-enablement-knowledge-foundation.md`

**Working deliverable:** Authorized administrators can import Markdown, submit it for department review, publish an immutable current version, retire a version, and browse/search only the knowledge visible to the logged-in employee.

**Includes:**

- Enablement navigation and permission tree.
- Typed knowledge, version, review, visibility, attachment, and chunk tables.
- Server-side content lifecycle and transaction boundaries.
- Department-manager review rule.
- Current-version browsing and keyword search.
- Minimal knowledge and publishing UI.
- Authenticated access to knowledge metadata; no public attachment URLs.

**Excludes:** learning paths, exams, practical tasks, AI answers, PDFs, PPTs, and videos.

**Gate to Increment 2:** A Markdown policy can move from draft to current effective, an unauthorized employee cannot review or publish it, and a retired version disappears from current search without deleting history.

### Increment 2: Courses, Learning Paths, and Automatic Enrollment

**Plan filename to create after Increment 1 is accepted:** `docs/superpowers/plans/2026-07-10-jixiang-enablement-onboarding-learning.md`

**Working deliverable:** Training administrators can compose published knowledge into courses and a configurable seven-day path; creating an active employee idempotently assigns the default path and the employee can complete required learning items.

**Includes:**

- `Course`, `CourseItem`, `LearningPath`, `LearningPathItem`, `Enrollment`, and `LearningProgress` tables.
- Default seven-calendar-day schedule with configurable offsets and due date.
- `Enrollment.reviewerUserId` resolved from `Department.managerId` with administrator reassignment.
- New-hire home page and progress state machine through `待考试`.
- Integration with `settingsService.createUser` through an idempotent assignment service.
- Version snapshots in learning progress.

**Gate to Increment 3:** Repeated employee-creation or retry events create one enrollment, required content reaches 100%, and historical progress still points to the version actually studied after a new knowledge version is published.

### Increment 3: Formal Exams, Practical Tasks, and Supervisor Gate

**Plan filename to create after Increment 2 is accepted:** `docs/superpowers/plans/2026-07-10-jixiang-enablement-assessment-review.md`

**Working deliverable:** A learner completes an approved formal exam, submits required practical tasks, receives supervisor approval or return comments, and only reaches `已通过` when every configured gate passes.

**Includes:**

- Question banks with single-choice, multiple-choice, and true/false questions.
- Exams, attempts, deterministic scoring, configurable pass mark defaulting to 80, and retry limits.
- Practical tasks, submissions, private attachments, supervisor reviews, and reassignment.
- Server-authoritative onboarding state machine.
- Supervisor and training-administrator work queues.
- Completion, overdue, exam, and returned-task metrics.

**Gate to Increment 4:** Attempts below the pass mark cannot advance, missing tasks block supervisor approval, a returned submission re-enters the correct state, and only an assigned reviewer or authorized administrator can make the final decision.

### Increment 4: AI Mentor, Document Parsing, Knowledge Gaps, and Final Analytics

**Plan filename to create after Increment 3 is accepted:** `docs/superpowers/plans/2026-07-10-jixiang-enablement-ai-mentor.md`

**Working deliverable:** Employees receive cited answers and practice help from current authorized knowledge, PDF text can be published, unsupported questions create knowledge gaps, and administrators can see onboarding and weak-topic analytics.

**Includes:**

- Shared `AiGateway` extracted from the current server entrypoint without changing AI Assistant behavior.
- `KnowledgeSearchProvider` reuse with a replaceable future vector-search implementation.
- `MentorConversation`, `MentorMessage`, `AiCitation`, `AiFeedback`, and `KnowledgeGap` tables.
- Markdown and PDF parsing; PPT/video remain attachments unless a reviewed summary or transcript is provided.
- Citation-bearing AI responses with current version, section, and timestamp.
- AI-unavailable fallback behavior.
- End-to-end onboarding dashboard and full acceptance suite.

**Final gate:** All twelve acceptance scenarios in `docs/superpowers/specs/2026-07-10-jixiang-enablement-platform-design.md` pass, including permission isolation, immutable history, AI citation, non-AI degradation, exam/task gating, and supervisor confirmation.

## Integration Rules Between Increments

- Each increment receives its own Prisma migration and can deploy independently.
- An increment may consume interfaces defined by an earlier increment but cannot reach into its internal repository implementation.
- API response contracts live in `src/types/enablement.ts` and remain backward compatible after publication.
- Every state transition is tested first at the service layer, then at the route boundary, then through one browser flow.
- Every commit contains one reviewable behavior and its tests; unrelated refactors are rejected from the increment.
- The next detailed plan is written against the repository state after the previous increment is accepted, preventing stale paths and signatures.

## Spec Coverage Review

| Approved design area | Implemented by rollout increment |
|---|---|
| One JixiangOS product with an isolated enablement domain | Global constraints and all increments |
| WPS/Obsidian source, department review, administrator publication | Increment 1 |
| Immutable knowledge versions, permissions, private files, and current search | Increment 1 |
| Seven-day common onboarding path and automatic employee assignment | Increment 2 |
| Learning progress bound to the studied knowledge version | Increment 2 |
| Formal exam, practical tasks, supervisor return/approval, and final gate | Increment 3 |
| Cited AI Mentor, knowledge gaps, PDF parsing, and AI degradation | Increment 4 |
| Training dashboard and weak-topic analytics | Increments 3 and 4 |
| Role isolation, auditability, failure handling, and regression testing | Every increment gate |
| External users, two-way WPS sync, online authoring, gamification, and vector database excluded | Global constraints and all increment plans |

No approved design requirement is omitted. Only Increment 1 is implementation-ready in this handoff; later increments have fixed boundaries and receive detailed file-level plans after the preceding increment is accepted, so their paths and interfaces are based on actual repository state rather than speculation.

## Release and Rollback Strategy

1. Apply the increment migration to a backed-up database.
2. Seed no production knowledge automatically; an administrator imports approved content through the UI.
3. Enable the new navigation only for roles with explicit enablement permission.
4. Verify the increment gate with one administrator, one department manager, and one employee account.
5. If verification fails, hide the navigation and roll back the application release; retain additive tables for investigation unless the migration itself caused the failure.
6. Never roll back by deleting published audit or learner history.

## Program Completion Definition

The rollout is complete when an internal employee account is created, receives the common onboarding path, studies approved versioned knowledge, uses cited AI assistance, passes the formal exam, submits practical work, receives supervisor approval, and appears as `已通过` in the training dashboard while all access and history rules remain enforced.
