# Task 6 report: customer contact identity governance

## Status

Implemented the Task 6 contact-identity foundation without adding a Prisma
`Customer` model. Customers remain `BusinessRecord(domain='aaos_customers')`
JSON rows. New customer creation, customer profile edits, explicit lead
conversion, and create-lead auto-claim now write contact identities and links
inside the same Prisma transaction as the customer/lead mutation and Task 5
audit append.

## Delivered interfaces

`server/services/contactIdentityService.ts` now provides:

- `normalizeContactIdentity(type, value)` with domestic phone `+86`
  canonicalization and case-insensitive trimmed WeChat identities.
- `hashContactIdentity(value, key)` using HMAC-SHA-256.
- `upsertCustomerContactIdentities(tx, input)` for unique customer ownership,
  reactivation of ended links, and end-after-success obsolete link handling.
- `linkLeadAndCustomerIdentity(tx, input)` for retained lead links plus the new
  customer link and canonical customer pointer.
- `endCustomerContactIdentityLinks` and `endLeadContactIdentityLinks` for
  transactional soft-delete cleanup; customer endings recompute canonical and
  conflict state under the identity lock.
- `backfillContactIdentities(prisma, options)` with dry-run default at the CLI,
  explicit apply mode, deterministic discovery, and idempotent unique-index
  writes.
- `ContactIdentityConflictError` with code
  `CONTACT_IDENTITY_CONFLICT` and a safe payload. The public message is always
  `系统中已存在相同联系方式`. A safe customer summary is returned only when
  the caller's existing `canReadCustomer` policy passes; unreadable conflicts
  return `data: null`.

## Cryptography and configuration

- Added independent, server-only base64 keys:
  `CONTACT_IDENTITY_HMAC_KEY` and `CONTACT_IDENTITY_ENCRYPTION_KEY`.
- Both keys must decode to at least 32 bytes. Their version variables are
  pinned to `1` until an explicit rehash/reencryption migration exists.
- The encryption key is domain-separated with HKDF-SHA-256 and normalized
  values are encrypted with AES-256-GCM. The versioned envelope contains only
  version/algorithm/nonce/ciphertext/tag. The derived encryption key buffer is
  zeroed after each encryption.
- No contact-operation default secret exists. Missing/partial/short keys fail
  closed. Production startup validation requires all four variables.
- Existing persistent contact lock keys were changed from raw SHA-256 contact
  digests to the same versioned contact HMAC boundary; no new plaintext or
  dictionary-able contact index is persisted.
- A controlled contact-backfill `--apply` removes only the obsolete, exact
  lowercase 64-hex Task 5 lock-key shape. Current versioned HMAC locks and all
  unrelated AppStorage keys are retained. The cleanup is in the same
  transaction as a successful apply and is retried by later applies if needed.
- `.env.example` documents independent key generation and the pinned rotation
  policy. The permission-migration signing key is not reused.

## Transaction integration

- `customerListService.create`: removed the JSON scan/deterministic raw-contact
  customer ID as uniqueness authority; creates identity/link, BusinessRecord,
  and audit event in one transaction. Customer IDs are now random UUID-based.
  Its conflict viewer is resolved from that transaction's current access scope,
  so only an authorized actor receives the allowlisted safe summary.
- `customerCommandService.updateCustomer`: retains association/contact locks,
  establishes all new identities before ending obsolete links, then persists
  the customer and synchronizes linked leads plus their identity links. Any
  conflict throws through the transaction and maps to HTTP/API 409 outside it.
- `convertLeadToCustomer`: identity/link writes precede customer creation in the
  same transaction, preserve the active lead link, create the customer link,
  and set `canonicalCustomerId`.
- `createLead` auto-claim: creates both lead/customer links transactionally with
  customer, lead, configuration, intake, and audit writes.
- Both customer soft-delete paths now end active customer identity links in the
  same transaction and recompute the identity status/canonical pointer. The
  independent-lead delete path ends historical lead links as well.
- Durable lead-intake collision records contain only the generic conflict
  message; customer/lead IDs and names are never copied into them.
- Role-name checks and data-scope semantics were not added or changed. Conflict
  visibility uses the existing stable `canReadCustomer` policy.

## Backfill and operability

- Added `scripts/backfill-contact-identities.ts` and the package command
  `pnpm customer-contacts:backfill`.
- The command is dry-run unless `--apply` is explicitly supplied.
- Output is aggregate JSON only: `canonicalCustomers`, `conflicts`,
  `invalidValues`, `duplicateGroups`, and `legacyContactLockKeysCleared`; it
  never logs contact values, hashes, ciphertext, customer names, or IDs.
- Apply mode writes identity/link/candidate records and can delete only the
  obsolete exact legacy lock keys inside its transaction. It never modifies
  customer BusinessRecord JSON.
- Historical identities with one active customer become canonical. Identities
  with multiple active customers become `conflict`, have no canonical customer,
  retain all active links, and produce one candidate group.
- Candidate groups reuse Task 5's
  `createOrReloadCustomerDuplicateGroup`, including its canonical SHA-256 of
  JSON `{ rule, customerIds: sortedUniqueIds }` and P2002 winner reload.
- Identity and link unique constraints plus link upsert/reactivation make apply
  reruns idempotent. Concurrent identity/group discovery uses `SELECT ... FOR
  UPDATE` current reads for both unique-key winner reload and active-link
  admission, so a REPEATABLE READ snapshot cannot add a second customer link.
- Added protected preview/apply endpoints alongside the existing owner-identity
  migration endpoints. `customerOwnerIdentityService.ts` owns only the response
  composition; owner and contact apply operations remain separate transactions
  so neither silently broadens the other's mutation scope.

## Corrective concurrency and migration hardening

- Contact identity IDs are now deterministic but type-qualified
  (`ci_<type>_<HMAC-prefix>`). A phone and WeChat value with the same normalized
  text can therefore coexist as the schema permits. No Prisma schema migration
  is required: existing `contact-<HMAC-prefix>` rows remain valid, and a later
  backfill creates only the previously blocked other type under its new ID.
- Before a manual backfill completes, each contact write takes the identity
  current lock and locks matching active legacy customer BusinessRecord rows.
  It attaches unlinked historical owners before deciding admission. New direct
  creation, profile edits, conversion, and auto-claim consequently either
  reconcile the legacy owner or fail with the same generic safe conflict.
- After a P2002, identity and duplicate-group code use a locking current read
  and rethrow the original P2002 if that read has no winner; they never fall
  back to an ORM snapshot read. Active customer-link admission is also a
  locking current read. Obsolete identities are locked before link-end and
  canonical recomputation.
- Deployment order: deploy this code everywhere and retire prior Task 5
  writers first; run a dry preview; then run the protected apply/CLI `--apply`.
  That apply performs the exact old-lock cleanup and fills any previously
  blocked cross-type identities. Re-running apply is safe and removes any old
  keys that were recreated before the legacy writers stopped.

## TDD evidence

The first red run failed with `ERR_MODULE_NOT_FOUND` for
`contactIdentityService`; the production-config regression independently failed
because the contact HMAC key was not validated. Subsequent red slices failed on
missing auto-claim identity/link creation, missing single-create identity/link
creation, and dropped authorized safe conflict data. Each slice was made green
before the next integration step.

Focused regressions cover:

- phone/WeChat normalization, direct HMAC result, encrypted-at-rest value, and
  key version persistence;
- one identity with active lead and customer links;
- customer-to-customer conflict rejection and readable/unreadable safe payloads;
- edit link rollover and canonical pointer behavior;
- explicit conversion and auto-claim atomic identity links;
- historical multi-customer conflict/candidate generation;
- dry-run no-write behavior and apply rerun idempotency;
- canonical Task 5 duplicate-group key representation;
- deterministic stale-snapshot P2002 tests for identity, active-link admission,
  and duplicate-group winner reload with asserted locked predicates/HMAC keys;
- phone/WeChat same-string primary-key separation plus compatibility with an
  existing pre-fix identity ID;
- empty-identity-table legacy direct create, profile edit, conversion, and
  auto-claim blocking; authorized direct-create safe conflict detail;
- both customer soft-delete paths ending links and restoring reusable canonical
  state; exact legacy-lock cleanup that preserves HMAC and lookalike keys;
- missing, short, incomplete, and unsupported-version production keys.

## Verification

- `pnpm run db:generate`, Prisma schema validation, and `pnpm run build`
  passed after the corrective changes.
- Required Task 6 focused tests passed:
  `contactIdentityService.test.ts`, `customerCommandService.test.ts`, and
  `customerOwnerIdentityService.test.ts`.
- Additional focused tests passed:
  `customerListService.test.ts`, `runtime.test.ts`, and
  `productionConfigCheck.test.ts`.
- The full `pnpm test` suite passed after the corrective changes.

## Self-review

- Raw-contact leakage: identity rows, lock rows, conflict responses, intake
  records, CLI output, and candidate-group keys contain no raw contact values.
  Existing authoritative customer/lead records still contain their business
  contact fields as before; the new identity index stores only HMAC plus
  authenticated ciphertext.
- Crypto/key lifetime: independent keys, minimum length, pinned versions,
  versioned GCM envelope, domain-separated derived encryption key, derived-key
  zeroing, and no fallback secret were verified.
- Transaction boundaries: all identity changes are inside the owning customer
  or lead transaction; conflict exceptions roll back contact locks, links,
  customer/lead writes, and audit writes.
- Legacy paths: POST customer create, edit, explicit conversion, and create-lead
  auto-claim are covered. Customer JSON remains a BusinessRecord.
- Safe conflicts: readable details are allowlisted (`id`, `name`, `company`,
  `owner`) only after `canReadCustomer`; unreadable responses and durable intake
  history are generic-only. Raw contact/hash/ciphertext are regression-tested.
- Backfill idempotency: deterministic sorted discovery, shared Task 5 group key,
  locking current-read P2002 reload, link reactivation, dry-run no writes,
  exact legacy-lock cleanup, and apply reruns were verified.

## Deferred release concern

No live database was created, migrated, or destructively modified. Validation
of the already-present migration's real MySQL constraints and production-copy
backfill remains the explicit Task 10 release gate. Deployment must provision
the four contact key variables and run the aggregate dry-run report before any
`--apply` execution. A true parallel MySQL REPEATABLE READ integration run is
still Task 10's release gate; deterministic stale-snapshot unit coverage is in
this task, but no live MySQL instance was provisioned here.
