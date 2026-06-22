# 🏦 Bank Transfer API

A production-grade banking backend built with **TypeScript**, **Express.js**, **PostgreSQL**, and **Docker** — designed to handle money transfers correctly and consistently under concurrent load.

> This project is not about building a full banking product. It is about learning how to build a backend that **never loses money, never double-spends, and never corrupts data** — even when many users are sending requests at the same time.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Architecture](#architecture)
- [Data Consistency & Financial Integrity](#data-consistency--financial-integrity)
- [Immutable Ledger System](#immutable-ledger-system)
- [Ledger-Derived Balances](#ledger-derived-balances)
- [Reconciliation](#reconciliation)
- [Outbox Pattern](#outbox-pattern)
- [Rate Limiting](#rate-limiting)
- [Database Design](#database-design)
- [Database Protections](#database-protections)
- [Performance Optimizations](#performance-optimizations)
- [Logging & Observability](#logging--observability)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [CI/CD](#cicd)
- [Docker](#docker)
- [Key Engineering Concepts Learned](#key-engineering-concepts-learned)
- [Future Improvements](#future-improvements)
- [Getting Started](#getting-started)

---

## Project Overview

The **Bank Transfer API** enables users to register, create accounts, and securely transfer money. 

The primary engineering focus is **correctness under concurrency**: resolving race conditions, handling network retries, and preventing data drift.

### Technology Stack
**TypeScript, Express.js, PostgreSQL, Docker, JWT, bcrypt, Pino, GitHub Actions, OpenAPI.**

---

## Features

### Authentication & Authorization
- **JWT & bcrypt:** Secures endpoints with signed tokens and protects passwords via cryptographic hashing.
- **Ownership Validation:** Strictly enforces that users can only view or transfer from accounts they explicitly own (returns `403 Forbidden` otherwise).

### Account Management
- Create accounts, view details, and retrieve real-time balances.

### Transfers & State Tracking
The core transfer mechanism prevents self-transfers, validates participants, and tracks lifecycle states (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
**Why states matter:** Explicit tracking ensures safe idempotency, resilient failure recovery, and reliable downstream event emission even if processes interrupt mid-flight.

---

## Architecture

> 📐 **Architecture diagram coming soon** — will be inserted here.

```
[ Client ]
    |
    v
[ Express API (TypeScript) ]
    |         |
    |         v
    |   [ Rate Limiter ]
    |
    v
[ Auth Middleware (JWT) ]
    |
    v
[ Route Handlers ]
    |
    ├──> [ Account Service ]
    |         |
    ├──> [ Transfer Service ]
    |         |
    |         ├──> [ PostgreSQL Transaction ]
    |         |         ├──> Row-Level Locks
    |         |         ├──> Ledger Entries
    |         |         ├──> Idempotency Check
    |         |         └──> Outbox Event
    |         |
    v         v
[ PostgreSQL Database ]
    |
    └──> [ Background Worker (Outbox Processor) ]
```

---

## Data Consistency & Financial Integrity

Financial systems must guarantee that money is never created, destroyed, or duplicated.

### PostgreSQL Transactions (ACID)
When moving funds, deducting from the sender and crediting the receiver must be an all-or-nothing operation. ACID guarantees (Atomicity, Consistency, Isolation, Durability) ensure that if a crash occurs mid-transfer, the database rolls back seamlessly, preventing "lost" money.

```typescript
// Executed atomically
await db.transaction(async (trx) => {
  await deductFromSender(trx, senderId, amount);
  await creditToReceiver(trx, receiverId, amount);
  await createLedgerEntries(trx, transferId, amount);
  await createOutboxEvent(trx, transferId);
});
```

---

### Row-Level Locking
To prevent double-spending race conditions (e.g., two concurrent requests attempting to transfer the remaining $100 balance), we use `SELECT ... FOR UPDATE`. This statement locks the row during the transaction, forcing concurrent reads to wait and serializing access.

```sql
SELECT * FROM accounts WHERE id = $1 FOR UPDATE;
```

```typescript
// Lock accounts before reading balances
const sender = await trx('accounts').where({ id: senderId }).forUpdate().first();
```

---

### Deadlock Prevention
Deadlocks occur when two transactions wait on each other's locks (e.g., A locks Acc1 waiting for Acc2, while B locks Acc2 waiting for Acc1). 

**Solution:** Deterministic Lock Ordering. By always acquiring locks by ascending account ID, concurrent transactions queue efficiently instead of deadlocking.

```typescript
const [firstId, secondId] = senderId < receiverId ? [senderId, receiverId] : [receiverId, senderId];
await lockAccount(trx, firstId);
await lockAccount(trx, secondId);
```

---

### Idempotency
Networks fail. If a client retries a successful transfer after a timeout, the money could move twice. 
**Solution:** Clients generate a unique UUID `Idempotency-Key`. The server caches the transfer result against this key. Duplicate requests return the cached response without reprocessing the transaction.

```typescript
const existing = await getIdempotencyRecord(trx, idempotencyKey);
if (existing) return existing.result; // Return cached response
// ... process transfer
await storeIdempotencyRecord(trx, idempotencyKey, result);
```

---

## Immutable Ledger & Reconciliation

Storing just the current balance (e.g., $500) destroys auditability. If a bug alters the balance, there's no historical proof. We solve this via a **Ledger**: a permanent, append-only record of every event.

Every transfer atomically creates two entries (`TRANSFER_OUT` and `TRANSFER_IN`).

### Ledger-Derived Balances
The ledger is the source of truth, but summing historical rows is slow. Instead, we use a **Cached Balance Pattern**: the `accounts.balance` is updated simultaneously within the ledger transaction for instant reads.

### Reconciliation
Reconciliation compares these two independent sources to ensure they align, catching bugs or unauthorized data modifications:

```sql
SELECT a.id, a.balance AS cached_balance, COALESCE(SUM(l.amount), 0) AS ledger_balance
FROM accounts a LEFT JOIN ledger_entries l ON l.account_id = a.id
GROUP BY a.id HAVING a.balance != COALESCE(SUM(l.amount), 0);
```

---

## Outbox Pattern

### The Dual-Write Problem
After a transfer, we update the database and emit an event (e.g., to Kafka). If the database commits but the event emission fails, the systems drift out of sync. You cannot atomically write to two disparate systems.

### The Solution
Instead of emitting events directly, we write them to an `outbox_events` table within the **same database transaction**. 

1. **Transaction Phase:** `UPDATE accounts`, `INSERT ledger_entries`, and `INSERT outbox_events` occur atomically.
2. **Delivery Phase:** A background worker polls `outbox_events` for unprocessed rows and delivers them with At-Least-Once guarantees.

```sql
CREATE TABLE outbox_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  VARCHAR(100) NOT NULL,
  payload     JSONB NOT NULL,
  processed   BOOLEAN DEFAULT false
);
```

---

## Rate Limiting
Rate limiting protects the API from abuse, such as brute-forcing login endpoints or spamming transfers. When limits are exceeded, the server returns an `HTTP 429 Too Many Requests` status, preserving resources for legitimate traffic.

---

## Database Design & Protections
Our data layer employs robust schemas and constraints as a final line of defense against application-level bugs.

### Tables & Relationships
- **`users`** & **`accounts`**: Users have one or many accounts.
- **`transfers`**: Records requests (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
- **`ledger_entries`**: Immutable balance movements.
- **`idempotency_keys`**: Caches responses for duplicate prevention.
- **`outbox_events`**: Queues downstream notifications.

### Constraints & Triggers
- **Foreign Keys**: Prevent orphaned data.
- **Check Constraints**: Enforce strictly positive transfer amounts and non-negative balances.
- **Unique Constraints**: Ensure `idempotency_key` uniqueness to reject parallel duplicate requests natively.
- **Triggers**: A PostgreSQL trigger throws exceptions on any `UPDATE` or `DELETE` attempt on `ledger_entries`, making financial history strictly immutable even to DB admins.

---

## Performance & Observability

### PostgreSQL Indexes & Execution Plans
Without indexes, the database falls back to slow full table scans. We created indexes on hot query paths (e.g., `user_id` on accounts, `sender_account_id`/`receiver_account_id` on transfers, and unprocessed `outbox_events`). Query efficiency was verified during development using `EXPLAIN ANALYZE`.

### Structured Logging (Pino)
Every significant event is logged as structured JSON (using [Pino](https://getpino.io/)). Unlike plain text, structured logs enable easy searching and aggregation in log management platforms (e.g., Datadog, CloudWatch) by filtering on properties like `transferId` or `durationMs`.

---

## API Documentation
The API is documented using OpenAPI 3.0, served at `/api/docs`. It acts as a clear contract between the backend and its consumers, detailing schemas, auth requirements, and example payloads to eliminate integration ambiguity.

---

## Testing

### Integration Tests

Integration tests exercise the full request lifecycle — from HTTP request through middleware, business logic, database operations, and back to the HTTP response. They verify that:

- Authentication works end-to-end
- Account creation and retrieval returns correct data
- Transfer validation correctly rejects invalid requests (insufficient funds, self-transfer, non-owned accounts)
- Idempotency keys prevent duplicate transfers
- Transfer state transitions follow the correct lifecycle

### Concurrency Tests

The most critical tests for a financial system simulate multiple simultaneous requests hitting the same endpoint.

```typescript
// Simulate 20 concurrent transfer requests from the same account
const transfers = Array.from({ length: 20 }, () =>
  request(app)
    .post('/transfers')
    .send({ from: senderAccountId, to: receiverAccountId, amount: 10 })
    .set('Authorization', `Bearer ${token}`)
);

const results = await Promise.all(transfers);
```

These tests verify that:
- The total money across all accounts is conserved (no money created or destroyed)
- No transfer overdrafts the sender beyond their balance
- The database remains consistent after parallel writes
- Row-level locking correctly serialises conflicting operations

**Why concurrency testing matters in financial systems:** A backend that works correctly in development (single requests, no parallel load) can silently corrupt data in production (hundreds of concurrent requests). Concurrency tests are the only way to catch race conditions before real money is involved.

### Load Testing (k6)

To verify the system's performance, throughput, and correctness under intense, sustained concurrent load, we run load tests using **k6**.

#### Scenario Configuration
- **Virtual Users (VUs):** Ramping from 50 to 400 concurrent VUs.
- **Duration:** 2 minutes.
- **Target Endpoint:** `POST /api/transfers` (utilizing a pre-seeded account with a high balance to support sustained volume).

#### Run Command
```bash
JWT_TOKEN="your_jwt_token" k6 run load-test.js
```

#### Results
Below are the benchmark results of the API running locally under simulated stress:

| Metric | Result | Target/Threshold | Status |
| --- | --- | --- | --- |
| **Total Requests** | 39,664 | N/A | - |
| **Request Throughput** | ~325 reqs/sec | N/A | - |
| **Success Rate (HTTP 200/201)** | 100.00% (39,664/39,664) | > 95.00% | Pass (0% errors) |
| **p(95) Response Time** | 1.67s | < 500ms | Fail (High DB contention) |
| **Average Response Time** | 425.03ms | N/A | - |
| **Median Response Time** | 202.30ms | N/A | - |
| **Max Response Time** | 2.19s | N/A | - |

#### Key Findings & Analysis
- **Correctness:** 100% of the requests completed successfully without a single server error (`500`) or database deadlock, proving the design of our **Deterministic Lock Ordering** mechanism is highly effective.
- **Latency & Database Contention:** The `p(95)` response time reached **1.67 seconds**, exceeding our target threshold of `500ms`. Under 400 concurrent VUs executing transactions simultaneously, the database experienced significant lock queuing. This is expected behavior under severe lock contention as transactions queue sequentially to acquire locks on the sender and receiver accounts, trade-offing tail latency for absolute financial correctness.

---

## DevOps & Deployment

### CI/CD (GitHub Actions)
Automated pipelines run on every `push` and `pull_request`. A fresh PostgreSQL container is spun up to execute all integration and concurrency tests, ensuring no code merges unless the system functions perfectly.

### Docker
The application and its database are containerized to eliminate "it works on my machine" issues. With `docker-compose up`, the entire API and PostgreSQL stack launches instantly in an isolated, reproducible environment.

---

## Key Engineering Concepts Learned

| Concept | Why It Matters |
|---|---|
| **Authentication** | Proves who you are; prevents unauthorised access |
| **Authorization** | Proves what you are allowed to do; prevents privilege escalation |
| **ACID Transactions** | Guarantees that multi-step operations are atomic; no partial writes |
| **Concurrency Control** | Prevents race conditions when multiple requests touch the same data |
| **Row-Level Locking** | Serialises access to individual rows; eliminates double-spending |
| **Deadlock Prevention** | Consistent lock ordering prevents two transactions blocking each other forever |
| **Idempotency** | Makes retries safe; prevents duplicate operations |
| **Immutable Ledgers** | Creates an unforgeable audit trail; enables reconciliation |
| **Ledger-Derived Balances** | Balances can always be recalculated from history; no single point of corruption |
| **Reconciliation** | Catches discrepancies between cached data and ground truth |
| **Outbox Pattern** | Solves the dual-write problem; guarantees event delivery |
| **Background Workers** | Decouples event processing from the request lifecycle |
| **Rate Limiting** | Protects against abuse, brute-force, and accidental overload |
| **Database Constraints** | Enforces data integrity at the lowest level, independent of application bugs |
| **Indexing** | Makes queries fast at scale; verified with `EXPLAIN ANALYZE` |
| **API Documentation** | Documents the contract between backend and consumers |
| **Integration Testing** | Verifies end-to-end correctness of the request lifecycle |
| **Concurrency Testing** | Validates correctness under parallel load — the hardest bugs to find |
| **Docker** | Reproducible, portable environments; eliminates "works on my machine" |
| **CI/CD** | Automated quality gates on every code change |

---

## Future Improvements

To handle production scale, the following enhancements are required:
- **Redis Rate Limiting**: Move from in-memory counters to Redis to support horizontal scaling across multiple API instances.
- **Message Broker**: Replace the in-process outbox handler with Kafka or RabbitMQ for durable event streaming to multiple consumer services.
- **Read Replicas**: Route read-heavy workloads (balance lookups) to PostgreSQL replicas.
- **Monitoring & Alerting**: Integrate Prometheus/Datadog for anomaly detection, real-time metrics dashboards, and latency alerting.
- **Webhooks**: Let clients subscribe to transfer lifecycle events instead of polling.

---

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose

### Run with Docker

```bash
# Clone the repository
git clone https://github.com/your-username/bank-transfer-api.git
cd bank-transfer-api

# Copy environment variables
cp .env.example .env

# Start the API and database
docker compose up

# The API is now running at http://localhost:3000
# Swagger docs at http://localhost:3000/api/docs
```

### Run Locally (without Docker)

```bash
npm install
npm run migrate
npm run dev
```

### Run Tests

```bash
# All tests
npm test

# Concurrency tests only
npm run test:concurrency
```

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@localhost:5432/bank` |
| `JWT_SECRET` | Secret for signing JWTs | `your-secret-key` |
| `JWT_EXPIRES_IN` | Token expiry duration | `1h` |
| `PORT` | API server port | `3000` |
| `NODE_ENV` | Environment (`development` / `production`) | `development` |

---

## License

MIT — feel free to use this project as a learning reference or starting point for your own backend work.

---

*Built as a deep-dive into backend correctness, financial data integrity, and concurrent systems design.*