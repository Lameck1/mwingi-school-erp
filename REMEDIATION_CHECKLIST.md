# Remediation Checklist

## Scope

- Fix verified payment void ledger type mismatch.
- Fix payment record duplicate suppression false positives.
- Fix student form create/edit submission contract mismatches.
- Fix student edit field hydration loss.
- Fix integrations masked-secret overwrite.
- Add regression coverage for payment-layer changes.
- Verify with targeted tests and TypeScript compile.

## Checklist Status

- [x] `electron/main/services/finance/PaymentService.internal.ts`: use ledger-supported reversal `transaction_type` for void reversal insertion.
- [x] `electron/main/ipc/finance/finance-handlers.ts`: removed historical payload duplicate short-circuit in `payment:record`; kept idempotency-key replay handling.
- [x] `src/pages/Students/StudentForm.tsx`: create flow now passes authenticated `user.id`; submit flow checks IPC `success` before navigation.
- [x] `src/pages/Students/StudentForm.tsx`: edit hydration now preserves `guardian_relationship` and `notes`.
- [x] `src/pages/Settings/Integrations.tsx`: masked sentinel values (`******`) are no longer re-saved as secrets.
- [x] `electron/main/ipc/finance/__tests__/finance-handlers.test.ts`: updated duplicate behavior test and added idempotency replay regression test.
- [x] `electron/main/services/finance/__tests__/PaymentService.test.ts`: strengthened ledger schema constraint in test DB and added reversal `transaction_type` regression test.
- [x] `src/types/electron-api/StudentAPI.ts` and `electron/preload/types.ts`: aligned student types with `guardian_relationship` and `notes`.

## Verification

- [x] `npm run test -- electron/main/ipc/finance/__tests__/finance-handlers.test.ts electron/main/services/finance/__tests__/PaymentService.test.ts`
- [x] `npx tsc --noEmit`
