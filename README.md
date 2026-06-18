# 🏦 Bank Transfer API
> A robust, concurrency-safe financial ledger API designed for atomic transactions and idempotency.

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-5.x-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

## 📖 Project Overview

The Bank Transfer API is a production-grade backend service built to safely handle financial transactions, account creation, and balance tracking. Handling money in distributed systems is notoriously difficult due to race conditions and network failures. This project was built to address those challenges by implementing strict distributed concurrency control, including `SELECT ... FOR UPDATE` row-level locking, deadlock prevention algorithms, and rigorous idempotency guarantees to ensure zero double-spending or corrupted states.

## ✨ Key Features

* **Concurrency Safe:** Utilizes PostgreSQL row-level locks and predictable lock ordering (`Math.min` / `Math.max`) to completely eliminate race conditions and deadlocks during concurrent transfers.
* **Idempotent Transfers:** Distributed idempotency key checks via `ON CONFLICT` constraints, allowing clients to safely retry network-failed requests without the risk of double charging.
* **ACID Transactions:** Full database transaction support with guaranteed rollbacks for failed or rejected transfers (e.g., insufficient funds).
* **Structured Logging via Pino:** Zero-cost, JSON-based structured logging for maximum production observability and debugging.
* **Automated Testing:** Comprehensive integration and concurrency test suites via Supertest and Jest, simulating simultaneous conflicting transfers to prove robustness.
* **Self-Documenting API:** Fully integrated Swagger UI for interactive, real-time endpoint documentation.
* **Containerized:** Docker and Docker Compose configurations for instant deployment and isolated database dependencies.

## 🛠 Tech Stack & Architecture

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend Framework** | Express.js | High-performance, minimalist web framework for routing. |
| **Language** | TypeScript | Strong typing, interfaces, and compile-time error catching. |
| **Database** | PostgreSQL | Relational database utilizing robust ACID compliance and locks. |
| **Database Driver** | `pg` (node-postgres) | Direct, low-overhead PostgreSQL connection pooling. |
| **Testing** | Jest & Supertest | Unit, integration, and concurrency race-condition testing. |
| **Logging** | Pino | High-speed structured JSON logging for production. |
| **Containerization** | Docker & Compose | Infrastructure orchestration and environment parity. |
| **Documentation** | Swagger / OpenAPI | Interactive API documentation generation. |

## 📂 Project Structure

```text
.
└── backend/
    ├── app.ts                  # Express application setup, middlewares, and swagger init
    ├── server.ts               # Server entry point and database initialization
    ├── controllers/            # Route controllers handling HTTP request/response validation
    ├── db/                     # PostgreSQL connection pool and schema init scripts
    ├── routes/                 # Express API route definitions
    ├── services/               # Core business logic and database transaction queries
    ├── tests/                  # Jest test suites (including heavy concurrency tests)
    ├── utils/                  # Utilities (e.g., Pino logger configuration)
    ├── Dockerfile              # Production-ready Docker image configuration
    ├── docker-compose.yml      # Orchestration for the API and PostgreSQL containers
    ├── package.json            # Dependencies and NPM scripts
    └── tsconfig.json           # TypeScript compilation configuration
```

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v20+ recommended)
* **Docker** & **Docker Compose**

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/devdesai06/Bank-Transfer-api.git
   cd "Bank Transfer Project"/backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the `backend` directory based on your environment:
   ```env
   # .env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5433
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_NAME=bank_transfer
   LOG_LEVEL=info
   ```

### Running Locally (Without Docker)
You must have a PostgreSQL instance running locally.
```bash
npm run dev
```

## 🐳 Docker Setup

To run the entire ecosystem (API + Database) in isolated containers without needing local PostgreSQL installed:

```bash
docker compose up --build
```
* The API will be available at `http://localhost:3000`.
* The PostgreSQL database is mapped to host port `5433` (to avoid conflicts with local DBs).
* Docker Compose utilizes a built-in startup retry loop in the application to gracefully wait for the database to become healthy.

## 📚 API Documentation & Usage

Once the server is running, navigate to the Swagger UI to view and interact with the endpoints:
👉 **[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**

### Example: Create a Transfer

**Request:**
```http
POST /api/transfers
Content-Type: application/json
Idempotency-Key: a3d2c88f-1234-5678-abcd-ef9012345678

{
  "fromAccountId": 1,
  "toAccountId": 2,
  "amount": 500
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "from_account_id": 1,
    "to_account_id": 2,
    "amount": "500.00",
    "created_at": "2026-06-18T12:00:00.000Z"
  }
}
```

## 🧪 Testing

The project contains comprehensive tests that evaluate basic functionality, boundary conditions (insufficient funds), and complex asynchronous race conditions.

To run the test suite:
```bash
npm test
```
*Note: Ensure your test database is running and credentials match your `.env`.*

## 📊 Production Logging

The project utilizes **Pino** for logging. 
- **Development:** When `NODE_ENV` is not `production`, logs are piped through `pino-pretty` to provide colorized, human-readable console output.
- **Production:** In production environments, logs default to high-performance, machine-readable JSON formats, which are strictly optimized for ingestion by log aggregators like Datadog, ELK, or AWS CloudWatch.

## 🤝 Contributing & License

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/devdesai06/Bank-Transfer-api/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

This project is open-source and available under the **MIT License**.
