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

The **Bank Transfer API** is a backend system that allows users to:

- Register and log in securely
- Create bank accounts
- View account balances
- Transfer money between accounts

The primary engineering challenge this project addresses is **correctness under concurrency**: what happens when two users try to transfer from the same account at the same time? What if a network error causes a client to retry a transfer request? What if a bug causes a cached balance to drift out of sync with reality?

These are the problems this project is built to solve.

### Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Framework | Express.js |
| Database | PostgreSQL |
| Containerization | Docker |
| Auth | JWT + bcrypt |
| Testing | Integration + Concurrency tests |
| CI/CD | GitHub Actions |
| Logging | Pino |
| API Docs | Swagger / OpenAPI |

---

## Features

### Authentication & Authorization

Secure authentication is the foundation of any financial system. This project implements:

- **JWT Authentication** — After logging in, users receive a signed JSON Web Token. Every protected request must include this token, which the server verifies before processing.
- **Password hashing with bcrypt** — Passwords are never stored in plain text. bcrypt applies a one-way cryptographic hash with a configurable cost factor, making brute-force attacks expensive.
- **Protected routes** — Middleware validates the JWT on every sensitive endpoint before the request reaches the business logic.
- **Ownership checks** — Users can only access accounts they own. Even with a valid token, attempting to read or transfer from another user's account returns a `403 Forbidden`.

### Account Management

- Create a bank account linked to the authenticated user
- Retrieve account details and current balance
- View full account information

### Transfers

The transfer system is the core of this project and includes:

- Sender and receiver validation
- Self-transfer prevention (you cannot transfer money to yourself)
- Transfer status tracking

#### Transfer States

Every transfer moves through a defined lifecycle:

| State | Meaning |
|---|---|
| `PENDING` | The transfer request has been received and validated |
| `PROCESSING` | Funds are being moved; locks are held |
| `COMPLETED` | Money has successfully moved between accounts |
| `FAILED` | The transfer could not be completed (e.g. insufficient funds) |

**Why transfer states matter:** In a real financial system, transfers are not instant. Networks fail, services restart, and retries happen. By tracking state explicitly, the system can always answer "what happened to this transfer?" — even if the process was interrupted mid-flight. States also make it possible to build idempotent APIs (more on this below) and to emit accurate events for downstream consumers.

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

This is the most important engineering section of the project. Financial systems must guarantee that money is never created, destroyed, or duplicated due to software bugs or concurrent requests.

### PostgreSQL Transactions (ACID)

**In plain English:** Imagine you are moving money from Account A to Account B. This requires two steps: subtract from A, add to B. If the system crashes between those two steps, you have a problem — money has left A but never arrived at B. A *transaction* guarantees that either both steps happen, or neither does.

**What ACID means:**

| Property | Meaning |
|---|---|
| **Atomicity** | All operations in a transaction either fully complete or fully roll back. No partial updates. |
| **Consistency** | The database moves from one valid state to another. Constraints are always respected. |
| **Isolation** | Concurrent transactions do not interfere with each other. Each sees a consistent snapshot. |
| **Durability** | Once a transaction commits, the data is permanently saved — even if the server crashes immediately after. |

**Why this matters for money:** Without ACID, a crash at the wrong millisecond could leave your database in a state where $500 vanished from one account but never appeared in another. PostgreSQL's transaction guarantees make this impossible.

```typescript
// All of this runs atomically — or none of it does
await db.transaction(async (trx) => {
  await deductFromSender(trx, senderId, amount);
  await creditToReceiver(trx, receiverId, amount);
  await createLedgerEntries(trx, transferId, amount);
  await createOutboxEvent(trx, transferId);
});
```

---

### Row-Level Locking

**In plain English:** Imagine two API requests arrive at the same millisecond, both trying to transfer $100 from the same account that only has $150. Without protection, both requests might read the balance ($150), both decide $150 ≥ $100 (valid!), and both deduct $100 — leaving the account at -$50. This is called a **race condition**, and in finance it is called **double-spending**.

**The fix — `SELECT ... FOR UPDATE`:**

```sql
SELECT * FROM accounts WHERE id = $1 FOR UPDATE;
```

This statement does two things: reads the row AND locks it. Any other transaction that tries to read the same row with `FOR UPDATE` must wait until the first transaction completes. This serialises concurrent access to the same account, eliminating the race condition entirely.

```typescript
// Lock both accounts before reading balances
const sender = await trx('accounts')
  .where({ id: senderId })
  .forUpdate()
  .first();

const receiver = await trx('accounts')
  .where({ id: receiverId })
  .forUpdate()
  .first();
```

---

### Deadlock Prevention

**In plain English:** A deadlock happens when two transactions are each waiting for the other to release a lock — so neither can proceed. Imagine Transaction A locks Account 1 and waits for Account 2, while Transaction B locks Account 2 and waits for Account 1. Both are stuck forever.

**The fix — deterministic lock ordering:**

Always acquire locks in the same order, regardless of which direction the transfer flows. If locks are always acquired by ascending account ID, two concurrent transfers between the same pair of accounts will never deadlock: the first to acquire lock on the lower ID will proceed, while the second waits.

```typescript
// Always lock the lower account ID first
const [firstId, secondId] = senderId < receiverId
  ? [senderId, receiverId]
  : [receiverId, senderId];

await lockAccount(trx, firstId);
await lockAccount(trx, secondId);
```

---

### Idempotency

**In plain English:** Networks are unreliable. A client sends a transfer request, the server processes it successfully, but the response never reaches the client due to a timeout. The client retries. Without protection, the money moves twice. This is called a **duplicate transfer**, and it is a serious financial bug.

**The fix — idempotency keys:**

The client generates a unique key (typically a UUID) for each intended transfer and sends it with the request. The server stores this key along with the transfer result. If the same key arrives again, the server returns the original response without processing a second transfer.

```
Client → POST /transfers
Headers: X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Body: { from: "acc_1", to: "acc_2", amount: 100 }

First request  → Transfer processed, result stored under key
Second request → Key found in DB, original result returned, no duplicate transfer
```

```typescript
const existing = await getIdempotencyRecord(trx, idempotencyKey);
if (existing) {
  return existing.result; // Return cached response
}
// ... process transfer
await storeIdempotencyRecord(trx, idempotencyKey, result);
```

---

## Immutable Ledger System

### Why storing balances alone is not enough

Imagine a bank that only stores your current balance: $500. If a bug in the application subtracts $50 incorrectly, your balance shows $450 — and there is no record of what happened. You cannot prove the error occurred. There is no history to audit.

This is why every serious financial system maintains a **ledger**.

### What is a Ledger?

A ledger is a permanent, append-only record of every financial event. Think of it like a printed bank statement: every transaction is written down and never erased. The current balance is always derived by summing all the entries.

**Append-only** means: no `UPDATE`, no `DELETE`. Every financial event creates new rows. History cannot be altered.

### How Transfers Create Ledger Entries

Every transfer creates exactly two ledger entries:

| Entry Type | Account | Amount | Description |
|---|---|---|---|
| `TRANSFER_OUT` | Sender | -100.00 | Funds debited |
| `TRANSFER_IN` | Receiver | +100.00 | Funds credited |

**Example — $200 transfer from Alice (acc_001) to Bob (acc_002):**

```
ledger_entries:
┌────────────────┬──────────────┬──────────────┬──────────────┐
│ transfer_id    │ account_id   │ entry_type   │ amount       │
├────────────────┼──────────────┼──────────────┼──────────────┤
│ txn_xyz        │ acc_001      │ TRANSFER_OUT │ -200.00      │
│ txn_xyz        │ acc_002      │ TRANSFER_IN  │ +200.00      │
└────────────────┴──────────────┴──────────────┴──────────────┘
```

Both entries are created inside the same database transaction — so they either both exist or neither does.

---

## Ledger-Derived Balances

### The ledger is the source of truth

The **true** balance of any account can always be calculated by summing its ledger entries:

```sql
SELECT SUM(amount) AS true_balance
FROM ledger_entries
WHERE account_id = $1;
```

However, running this sum on every balance read would be slow as history grows. So the system maintains a **cached balance** on the accounts table, updated inside each transaction alongside the ledger entries.

### The Cached Balance Pattern

```
Ledger entries  →  Source of truth (permanent record)
accounts.balance →  Cache (fast reads, derived from ledger)
```

The cached balance is always updated within the same transaction that creates ledger entries. Because they happen atomically, the cache can never drift out of sync due to a partial write.

---

## Reconciliation

### What is reconciliation?

Reconciliation is the process of comparing two independent sources of the same truth to verify they agree. In financial systems, this means comparing the cached balance against the balance calculated from ledger entries.

```sql
-- Reconciliation query
SELECT
  a.id,
  a.balance AS cached_balance,
  COALESCE(SUM(l.amount), 0) AS ledger_balance,
  a.balance - COALESCE(SUM(l.amount), 0) AS discrepancy
FROM accounts a
LEFT JOIN ledger_entries l ON l.account_id = a.id
GROUP BY a.id
HAVING a.balance != COALESCE(SUM(l.amount), 0);
```

If this query returns any rows, something has gone wrong — a bug, a manual database edit, or data corruption. In production systems, reconciliation runs automatically on a schedule and triggers alerts if discrepancies are found.

---

## Outbox Pattern

### The dual-write problem

Imagine a transfer completes successfully. The system now needs to:
1. Update the database (balances, ledger entries)
2. Send an event to a message queue (e.g. "transfer completed") for other services to consume

If step 1 succeeds but step 2 fails (network error, queue down), the database is correct but the event was never sent. Downstream services never learn the transfer happened. This is the **dual-write problem**: you cannot atomically write to two different systems.

### How the Outbox Pattern solves this

Instead of writing to the message queue directly, the system writes the event to an **`outbox_events` table inside the same database transaction**. Because it is in the same transaction, it is guaranteed to be saved if and only if the business data is saved.

A separate **background worker** then polls the outbox table, processes undelivered events, and marks them as processed.

```
Transfer Transaction:
  ├── UPDATE accounts (deduct)
  ├── UPDATE accounts (credit)
  ├── INSERT ledger_entries (x2)
  └── INSERT outbox_events { event: "TRANSFER_COMPLETED", payload: {...} }
                                ↑
                         All atomic in one transaction

Background Worker (runs every few seconds):
  ├── SELECT * FROM outbox_events WHERE processed = false
  ├── Deliver event to message queue / webhook / other service
  └── UPDATE outbox_events SET processed = true
```

### Outbox Events Table

```sql
CREATE TABLE outbox_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  VARCHAR(100) NOT NULL,
  payload     JSONB NOT NULL,
  processed   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
```

### Example Transfer Flow

```
1. Client sends POST /transfers
2. API validates request, checks idempotency key
3. Database transaction begins
   a. Lock sender and receiver accounts
   b. Verify sender has sufficient funds
   c. Deduct from sender, credit to receiver
   d. Insert two ledger entries
   e. Insert outbox event
   f. Commit transaction
4. API returns 200 to client
5. Background worker picks up outbox event → delivers to downstream consumers
```

---

## Rate Limiting

### Why APIs need rate limiting

Without rate limiting, a malicious actor (or a buggy client) could send thousands of requests per second to your API. This could:

- Exhaust your database connection pool
- Cause legitimate users to experience slow responses
- Enable brute-force attacks on the login endpoint (trying millions of passwords)
- Allow automated scripts to drain accounts via transfer spam

### How it is implemented

Rate limiting is applied at the middleware level, before requests reach the application logic.

- **Login endpoint** — Strictly rate-limited to prevent password brute-forcing
- **Transfer endpoint** — Limited to prevent automated abuse and accidental runaway clients

When the limit is exceeded, the API returns:

```
HTTP 429 Too Many Requests
Retry-After: 60
```

HTTP `429` is the standard status code meaning "you have sent too many requests — slow down." The `Retry-After` header tells the client how many seconds to wait before trying again.

---

## Database Design

### Tables Overview

#### `users`
Stores registered user accounts.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| email | VARCHAR | Unique user email |
| password_hash | VARCHAR | bcrypt-hashed password |
| created_at | TIMESTAMPTZ | Registration timestamp |

#### `accounts`
Bank accounts belonging to users.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | FK → users.id |
| balance | NUMERIC(18,2) | Cached current balance |
| created_at | TIMESTAMPTZ | Account creation time |

#### `transfers`
Records of every transfer request.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| sender_account_id | UUID | FK → accounts.id |
| receiver_account_id | UUID | FK → accounts.id |
| amount | NUMERIC(18,2) | Transfer amount |
| status | ENUM | PENDING / PROCESSING / COMPLETED / FAILED |
| idempotency_key | VARCHAR | Unique key per client request |
| created_at | TIMESTAMPTZ | Request timestamp |

#### `ledger_entries`
Immutable record of every balance movement.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| transfer_id | UUID | FK → transfers.id |
| account_id | UUID | FK → accounts.id |
| entry_type | ENUM | TRANSFER_IN / TRANSFER_OUT |
| amount | NUMERIC(18,2) | Positive (credit) or negative (debit) |
| created_at | TIMESTAMPTZ | Entry timestamp (immutable) |

#### `idempotency_keys`
Prevents duplicate transfer processing.

| Column | Type | Description |
|---|---|---|
| key | VARCHAR | Unique client-provided key (PK) |
| transfer_id | UUID | FK → transfers.id |
| response_body | JSONB | Cached API response |
| created_at | TIMESTAMPTZ | First seen timestamp |

#### `outbox_events`
Events pending delivery to downstream systems.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| event_type | VARCHAR | Event name (e.g. TRANSFER_COMPLETED) |
| payload | JSONB | Event data |
| processed | BOOLEAN | Whether the event has been delivered |
| created_at | TIMESTAMPTZ | Creation timestamp |
| processed_at | TIMESTAMPTZ | Delivery timestamp |

### Relationships

```
users
  └──< accounts (one user can have many accounts)
         └──< transfers (as sender or receiver)
                └──< ledger_entries (each transfer creates entries)
                └──< idempotency_keys (one per transfer)
                └──< outbox_events (one or more per transfer)
```

---

## Database Protections

Application code can have bugs. Database-level constraints provide a second layer of protection that cannot be bypassed even by flawed application logic.

### Foreign Keys

```sql
FOREIGN KEY (user_id) REFERENCES users(id)
```

Ensures that an account cannot exist without a valid user, a transfer cannot reference a non-existent account, and ledger entries cannot exist without a valid transfer. Prevents orphaned data.

### Check Constraints

```sql
ALTER TABLE transfers ADD CONSTRAINT positive_amount CHECK (amount > 0);
ALTER TABLE accounts ADD CONSTRAINT non_negative_balance CHECK (balance >= 0);
```

Ensures the database will reject a transfer of -$50 or a balance update that would go below zero — even if the application forgets to check.

### Unique Constraints

```sql
UNIQUE (idempotency_key)
```

Guarantees that even if two concurrent requests with the same idempotency key slip through application-level checks simultaneously, the database will reject the duplicate at the constraint level.

### Immutable Ledger Trigger

A PostgreSQL trigger prevents anyone (including the application) from updating or deleting ledger entries:

```sql
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_immutability
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();
```

This means no bug in application code — and no developer with database access — can silently alter financial history.

---

## Performance Optimizations

### PostgreSQL Indexes

An index is a data structure that allows the database to find rows quickly without scanning the entire table. Without indexes, a query like "find all transfers for account X" would read every single row in the transfers table — which becomes unacceptably slow as data grows.

Indexes created in this project:

```sql
-- Find all accounts for a user
CREATE INDEX idx_accounts_user_id ON accounts(user_id);

-- Find transfers by sender or receiver
CREATE INDEX idx_transfers_sender ON transfers(sender_account_id);
CREATE INDEX idx_transfers_receiver ON transfers(receiver_account_id);

-- Find ledger entries for an account
CREATE INDEX idx_ledger_account_id ON ledger_entries(account_id);

-- Find unprocessed outbox events quickly
CREATE INDEX idx_outbox_unprocessed ON outbox_events(processed) WHERE processed = false;
```

### Query Plan Verification with EXPLAIN ANALYZE

```sql
EXPLAIN ANALYZE
SELECT * FROM ledger_entries WHERE account_id = 'acc_001';
```

`EXPLAIN ANALYZE` shows the execution plan PostgreSQL chose for a query — including whether it used an index or fell back to a slow full table scan. This was used during development to verify that all hot queries use indexes.

---

## Logging & Observability

### Pino Logging

[Pino](https://getpino.io/) is a high-performance structured logging library for Node.js. Every significant event in the API is logged with context.

**Structured logs** output JSON rather than plain text strings:

```json
{
  "level": "info",
  "time": "2024-01-15T10:23:45.123Z",
  "msg": "Transfer completed",
  "transferId": "txn_abc123",
  "senderId": "acc_001",
  "receiverId": "acc_002",
  "amount": 200.00,
  "durationMs": 34
}
```

**Why structured logs matter:** Plain text logs like `"Transfer abc123 completed"` are human-readable but cannot be easily searched or aggregated. Structured JSON logs can be ingested by log management platforms (Datadog, Grafana Loki, AWS CloudWatch Logs) and queried with filters like `transferId = "abc123"` or `amount > 1000` — essential for debugging production incidents at scale.

---

## API Documentation

### Swagger / OpenAPI

The API is fully documented using the OpenAPI 3.0 specification, served via Swagger UI at `/api/docs`.

Every endpoint documents:
- Request body schema and validation rules
- Required headers (e.g. `Authorization: Bearer <token>`)
- Response schemas for all status codes
- Example request and response payloads

**Why API documentation matters:** Documentation is the contract between a backend and anyone who consumes it — frontend developers, mobile teams, partner integrations, or future-you. Well-maintained docs eliminate ambiguity, reduce integration bugs, and make onboarding new developers dramatically faster.

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

---

## CI/CD

### GitHub Actions

A CI/CD pipeline runs automatically on every `push` and `pull_request` to the main branch.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: password
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run migrate
      - run: npm test
```

**Benefits of Continuous Integration:**

- Bugs are caught before they reach production, not after
- No code can be merged to main without passing all tests
- Every team member's changes are automatically verified
- Reduces the "it works on my machine" class of problems
- Builds confidence in the codebase over time

---

## Docker

### Why Docker?

Without Docker, setting up this project on a new machine requires installing the correct version of Node.js, PostgreSQL, configuring environment variables, running migrations, and hoping the local environment matches production. This process is fragile, time-consuming, and inconsistent across operating systems.

Docker packages the application and its dependencies into **containers** — isolated, reproducible environments that behave identically on every machine.

### docker-compose

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - db
    environment:
      DATABASE_URL: postgres://postgres:password@db:5432/bank

  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

With Docker, the entire stack — API server and PostgreSQL database — starts with a single command:

```bash
docker compose up
```

This makes onboarding instant, local development consistent, and deployment straightforward.

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

The following enhancements would bring this project closer to production-grade quality at scale:

### Distributed Rate Limiting with Redis
The current rate limiter uses in-process memory, which means each API server instance has its own counter. With horizontal scaling (multiple servers), a user could bypass limits by having requests hit different instances. Redis-backed rate limiting shares state across all instances.

### Message Broker Integration (Kafka / RabbitMQ)
The Outbox Pattern currently delivers events to a simple in-process handler. Replacing this with a real message broker would enable reliable event streaming to multiple downstream consumers — analytics pipelines, notification services, fraud detection systems — with durability and replay guarantees.

### Horizontal Scaling
Running multiple API instances behind a load balancer to handle higher throughput. Requires stateless request handling (already achieved via JWTs) and shared external state (Redis for rate limiting, PostgreSQL for data).

### PostgreSQL Read Replicas
For read-heavy workloads (balance lookups, account history), route queries to one or more read replicas while writes go to the primary. This reduces load on the primary and improves read latency.

### Monitoring & Alerting
Integrate with Prometheus or Datadog to collect metrics (request rate, error rate, transfer volume, p99 latency) and set up alerts for anomalies — e.g. error rate spikes, reconciliation failures, or unusual transfer volumes that may indicate fraud.

### Metrics Collection & Dashboards
Build operational dashboards showing real-time transfer throughput, success/failure ratios, average processing time, and queue depth for the outbox worker.

### Event Streaming for Audit
Stream ledger events to an immutable append-only store (e.g. Apache Kafka with log compaction or AWS Kinesis) to maintain a fully auditable, independently verifiable record of every financial event.

### Webhook Delivery for Clients
Expose a webhook system so client applications can subscribe to transfer events (completed, failed) rather than polling the API — a common pattern in payment APIs like Stripe.

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