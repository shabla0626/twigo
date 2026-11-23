# Financial transparency: design for Phase 3 (not implemented)

> **Twigo note:** under the Twigo model the platform receives no project revenue. Project groups document their own finances in project agreements; Twigo publishes only aggregate Community Support reports (`/support`). See [TWIGO-IMPLEMENTATION-REPORT.md](TWIGO-IMPLEMENTATION-REPORT.md).

The founder intends to share genuine business results with members. Phase 1 only
prepares the architecture. **No figures are published, no payments, wallets, investment
accounts, cryptocurrency or capital-contribution features exist, and none are planned.**

## What exists now (Phase 1)
- Private compensation records per project assignment (`CompensationAgreement`), visible
  only to the OWNER (`compensation.view`, `compensation.manage`).
- A separate permission `finance.view` (OWNER only), reserved for future reports.
- Projects can be linked to the research group they came from (`Project.researchGroupId`).
- Audit log of every compensation change (metadata excludes amounts).

## Proposed Phase 3 model
| Entity | Purpose |
| --- | --- |
| `ProjectRevenue` | Actual customer payments received (date, amount in minor units, source document reference) |
| `ProjectExpense` | Direct costs (category, amount, receipt reference) |
| `DistributionRun` | A settled calculation for a period/project, referencing the policy version |
| `DistributionLine` | Per-participant settled total (no bank data) |
| `FinancialReport` | A published, read-only summary for members (approved by the OWNER) |

Permissions:
- `finance.manage`: enter revenue/expenses (OWNER, optionally a designated finance admin).
- `finance.view`: see detailed records (OWNER).
- `finance.reports.publish`: publish a member-visible report (OWNER).
- Members see only published reports: totals per project and period, distributable
  amount, policy applied, and their **own** settled total. Never other members' banking,
  tax identifiers or confidential contract terms.

Rules: amounts stored as integers in minor units; every record immutable after
settlement (corrections as new entries); every change audited; reports generated from
data, never typed by hand.
