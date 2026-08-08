# Hotel OS — Property Management System

India-first, multi-property SaaS PMS based on the **Hotel OS PMS Complete PRD v1.0**.

> Run reservations, rooms, guests, front office, housekeeping, folios, payments, night audit and OTA distribution from one trusted system.

## Stack (PRD-aligned)

| Layer | Choice |
| --- | --- |
| Web | Next.js + React + TypeScript + TanStack Query |
| API | NestJS modular monolith + OpenAPI |
| Data | Prisma + SQLite (local) / PostgreSQL (compose) |
| Auth | JWT + role permissions |
| Distribution | Channex connector stub (inventory remains PMS SoT) |

## Monorepo

```
apps/api          NestJS PMS API
apps/web          Next.js PMS UI
packages/shared   Shared enums, permissions, Zod schemas
```

## Quick start

```bash
pnpm install
pnpm --filter @hotel-os/api db:push
pnpm --filter @hotel-os/api db:seed
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000
- OpenAPI: http://localhost:4000/docs

### Demo login

| User | Email | Password |
| --- | --- | --- |
| Admin | `admin@hotel-os.demo` | `password123` |
| Front desk | `frontdesk@hotel-os.demo` | `password123` |

Tenant slug: `demo` · Property: **AAYOR Grand Mumbai**

## What this foundation delivers

Phase-1 slice of the PRD roadmap:

1. **SaaS foundation** — tenant → company → brand → property, RBAC, audit log, idempotency keys
2. **Room catalogue** — room types, physical rooms, sellable products, rate plans
3. **Inventory ledger** — date-level sellable inventory with transactional reserve/release
4. **Reservations** — availability search, confirm, cancel, arrivals, tape chart
5. **Stay ops** — check-in, check-out, room move
6. **Housekeeping board** — task state machine synced to room status
7. **Night audit** — precheck blockers + business-date advance
8. **Distribution stub** — Channex provision / activate / full-sync contracts

## Roadmap (from PRD §18)

1. Foundation & UX system ← **this PR**
2. Room, rate & inventory core (harden tape chart / restrictions / floors)
3. Reservation & guest core (holds, waitlist, notifications)
4. Stay operations (extend, express checkout, keys)
5. Folio, cashier & night audit (routing, payments, city ledger)
6. Housekeeping & offline edge
7. Channex certification (ARI, booking feed, MMT/Goibibo pilot)
8. AI copilots (front desk, assignment, handover, sync support)

## Design notes

- PMS is source of truth for sellable inventory and reservation state
- Channex is transport only (replaceable connector)
- Inventory mutations are transactional; no UI/AI/channel adapter mutates availability directly
- Posted folio entries are never deleted (reversals later)

## Scripts

```bash
pnpm dev            # API + web
pnpm build          # shared + api + web
pnpm db:seed        # reset demo property data
pnpm test           # API unit tests
```
