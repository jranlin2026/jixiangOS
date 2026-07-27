# Task 2 report — WeChat customer check/create deep module

## Outcome

Implemented the customer automation business module behind only `check(input,
context)` and `create(input, token, context)`.

The module now owns required-field and phone normalization, fail-closed
lead-source resolution, active/scope-safe owner resolution, exact customer-tag
resolution, personal-resource contributor resolution, permission-safe duplicate
prechecks, signed input/config bindings, execution-time authorization/config
revalidation, and delegation to the existing transactional customer creator.

No schema or migration was added. Manual customer creation keeps its original
`create_customer` / `创建客户` audit behavior; automation creation uses
`create_customer_from_wechat` / `微信自动化创建客户`.

## RED / GREEN evidence

### Exact read-only contact duplicate lookup

RED:

```text
npx tsx server/services/contactIdentityService.test.ts
SyntaxError: ... does not provide an export named
'findExactCustomerContactDuplicate'
```

GREEN:

```text
npx tsx server/services/contactIdentityService.test.ts
exit 0
```

The public helper normalizes phone and WeChat with the existing HMAC
representation, reads only active customer links, takes no lock, reuses the
existing visibility-safe conflict projection, and never returns the raw
contact value.

### Initial check tracer

RED:

```text
npx tsx server/services/wechatCustomerAutomationService.test.ts
ERR_MODULE_NOT_FOUND: .../wechatCustomerAutomationService
```

The first implementation run then exposed the existing storage normalization
as `+8613800138000`; the test expectation was corrected to the repository's
authoritative `normalizePhoneForStorage` behavior.

GREEN:

```text
npx tsx server/services/wechatCustomerAutomationService.test.ts
wechat customer automation service tests passed
```

This proves one-question required-field results, normalized phone storage,
default `公司资源`, default automation-actor owner, exact active source
resolution, and a ten-minute signed precheck without raw contacts in its token
payload.

### Directory, tags, attribution, and duplicates

Incremental RED runs showed:

```text
owner account: expected ready, received needs_input
unique owner name: expected ready, received needs_input
ambiguous owner: candidates/message missing
exact tag name: expected ready, received needs_input
personal resource: missing contributor was incorrectly ready as 公司资源
```

Each behavior was implemented and returned to GREEN before the next slice.
Final coverage includes exact owner account, unique owner name, ambiguous
account candidates, inactive/out-of-scope/accountless owners, exact active tag
names, personal-resource contributor account, exact active hierarchical lead
sources, malformed source configuration, and permission-safe duplicate
summaries.

### Create, token security, revalidation, race, and audit

RED:

```text
Error: WeChat customer creation is not implemented.
```

The execution-time role regression then produced:

```text
AssertionError: Missing expected rejection.
```

GREEN coverage proves:

- expired, signature-tampered, input-swapped, and sender-swapped tokens reject;
- the token binds resolved owner/contributor/source/tag stable IDs as well as
  the normalized customer, so same-name config rebinding invalidates it;
- current persisted create permission, owner scope, source state, and tag
  definitions are re-read;
- the final customer transaction receives no precheck-era access/tag snapshot,
  so it reloads both authorization and tag validation inside the transaction;
- an integration-style race fixture calls the real customer-list creator after
  `check`, inserts a same-contact customer whose identity index has not yet
  been backfilled, and proves the create transaction takes the mutation,
  legacy-source, and current identity-link locks before returning `duplicate`;
- the losing transaction commits neither a second customer nor a create audit,
  and all tentative identity/link writes are rolled back;
- a create-time contact `409` is mapped to `duplicate`, while unrelated `409`
  failures are not mislabeled;
- automation audit operation/reason are applied and the first manual-create
  audit remains unchanged.

The post-review integration regression passed on its first execution. This was
a coverage defect rather than a production behavior defect: replacing the
canned customer-service `409` with the real creator/identity fixture confirmed
that the already-implemented transaction path satisfies the required race
behavior without a production-code change.

## Changed files

- `server/services/wechatCustomerAutomationService.ts`
- `server/services/wechatCustomerAutomationService.test.ts`
- `server/services/contactIdentityService.ts`
- `server/services/contactIdentityService.test.ts`
- `server/services/customerListService.ts`
- `server/services/customerListService.test.ts`
- `server/db/customerAuditProjection.ts`
- `server/services/customerCommandService.ts`
- `server/services/wechatAutomationSecurity.test.ts`

`customerCommandService.ts` now imports/re-exports the shared closed audit
operation vocabulary from `customerAuditProjection.ts`. The security test
changed `String.prototype.at(-1)` to indexed access only to retain the existing
non-canonical-signature regression under the repository's TypeScript target.

## Final verification

```text
npx tsx server/services/wechatCustomerAutomationService.test.ts  PASS
npx tsx server/services/contactIdentityService.test.ts           PASS
npx tsx server/services/customerListService.test.ts               PASS
npx tsx server/services/customerAuditService.test.ts              PASS
npx tsx server/services/customerCommandService.test.ts            PASS
npx tsx server/services/wechatAutomationSecurity.test.ts          PASS
npx tsc -b --pretty false                                         PASS
npm test                                                          277 test files passed
git diff --check                                                  PASS
```

After the independent-review race fixture replaced the canned `409`, the
automation, contact-identity, and customer-list focused tests, TypeScript build,
and diff check were rerun and passed.

The live-database integration test in the full suite was skipped because
`DATABASE_URL` is not set; its static/in-memory foundation tests passed.

## Self-review

Two-axis review found two important issues that were fixed before final
verification:

1. the automation layer initially passed precheck-era access/tag snapshots
   into the customer transaction; these are now deliberately omitted so the
   authoritative transaction reloads them;
2. source configuration initially inherited a general import fallback; this
   automation path now fails closed unless stored source rows are well-formed,
   uniquely named, and explicitly active.

The review also narrowed the direct user lookup to the six fields needed for
resolution and excluded accountless employees from owner-name selection.

A subsequent independent review found that the automation race test mocked the
final `409` instead of exercising the real transaction. The test now uses the
real customer creator and contact-identity implementation with a rollback-aware
database adapter, proves all required locks were reached, and asserts no second
customer, audit, identity, or link survives the conflict.

Durable replay is intentionally not implemented here: Task 3 explicitly owns
the AppStorage idempotency record, concurrent replay, recovery, and the
`replayed` result. Task 2 forwards request/idempotency metadata to the existing
audit path without inventing a competing store.

## Concerns

No Task 2 implementation blocker. Task 3 must add the planned durable
idempotency/replay state before the HTTP create endpoint is exposed.
