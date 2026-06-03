# YipitData KPI Dashboard

A full-stack application for Brand and Retailer stakeholders to monitor KPI estimates (ASP, GMV, Units Sold) across companies and sectors, with real-time notifications and AI agent access via MCP.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                     Monorepo                        │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │ shared/  │   │  backend/    │   │  frontend/  │  │
│  │ (types)  │──▶│  Fastify 5   │◀──│  React 19   │  │
│  └──────────┘   │  Drizzle ORM │   │  Vite 8     │  │
│                 │  MCP Server  │   │  Recharts   │  │
│                 └──────┬───────┘   └─────────────┘  │
│                        │                            │
│                 ┌──────▼───────┐                    │
│                 │  PostgreSQL  │                    │
│                 └──────────────┘                    │
└─────────────────────────────────────────────────────┘
```

**Real-time flow**: When `POST /estimates` is called → Drizzle inserts into DB → `SseManager.broadcast()` pushes a `NEW_ESTIMATE` event to all connected `EventSource` clients → React toast notification appears instantly.

---

## Tech Stack & Justification

| Layer | Choice | Why |
|-------|--------|-----|
| Backend framework | Fastify 5 | Lowest overhead in Node.js ecosystem; schema-based validation; plugin system is clean |
| ORM | Drizzle | Type-safe SQL with zero runtime overhead; schema is source of truth; migrations are SQL files |
| Validation | Zod | Composable, type-inference at compile time; shared with frontend if needed |
| DB Driver | postgres.js | Fastest PostgreSQL driver for Node.js; native connection pooling |
| Frontend | React 19 + Vite 8 | Industry standard; Vite's HMR is instant in dev |
| Data fetching | TanStack Query v5 | Server state management, caching, background refetch; avoids duplicating fetch logic |
| Charts | Recharts 2 | Composable chart primitives on top of D3; easy to customize |
| Styling | Tailwind CSS v4 | Utility-first; no CSS specificity battles; minimal bundle |
| Real-time | SSE (Server-Sent Events) | One-directional push from server is sufficient for notifications; zero extra deps vs WebSockets; native browser support via `EventSource` |
| MCP | `@modelcontextprotocol/sdk` | Official SDK; stdio transport works out of the box with Claude Desktop and Cursor |
| Auth | JWT (hardcoded users) | Stateless; no session storage needed; assessment scope doesn't require a real IDP |

---

## Setup & Run

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ running on `localhost:5432`
- `psql` or `pg_isready` accessible

### 1. Create the database
```bash
psql -U postgres -c "CREATE DATABASE yipitdata_kpi;"
```

### 2. Configure environment
```bash
cp backend/.env.example backend/.env
# Edit backend/.env if your Postgres credentials differ from the defaults
```

### 3. Install dependencies
```bash
npm install
```

### 4. Run migrations
```bash
npm run migrate
```

### 5. Seed with mock data
```bash
npm run seed
```

### 6. Start development servers
```bash
npm run dev
```

This starts:
- **Backend** on `http://localhost:3000`
- **Frontend** on `http://localhost:5173`

---

## Auth Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@yipit.com | admin123 | admin |
| user@yipit.com | user123 | viewer |

---

## API Reference

All protected routes require `Authorization: Bearer <token>`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/login` | Returns JWT |
| `GET` | `/sectors` | List sectors with company counts |
| `GET` | `/companies` | List companies (`?sector=footwear&search=nike`) |
| `GET` | `/companies/:id` | Company detail + latest MTD snapshot |
| `GET` | `/companies/:id/estimates` | Time-series estimates (`?kpiId=1&dateFrom=2024-01-01&dateTo=2025-01-01&type=historical`) |
| `POST` | `/estimates` | Publish new estimate → triggers SSE push |
| `GET` | `/kpis` | List KPI definitions |
| `GET` | `/notifications/stream?token=<jwt>` | SSE stream for real-time notifications |
| `GET` | `/health` | Health check |

### Publish a new estimate (triggers notification)
```bash
curl -X POST http://localhost:3000/estimates \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": 1,
    "kpiId": 1,
    "periodMonth": "2025-06-01",
    "estimateValue": 32000000,
    "estimateType": "mtd"
  }'
```

---

## MCP Server

The same database that powers the REST API is exposed as an MCP server for AI agents.

### Tools

| Tool | Description |
|------|-------------|
| `list_sectors()` | All sectors with company counts |
| `list_companies(sector?, search?)` | Companies, filterable by sector/name |
| `get_company(companyId)` | Company detail |
| `list_kpis()` | Available KPI definitions |
| `get_estimates(companyId, kpiId?, dateFrom?, dateTo?, type?)` | Time-series KPI data |
| `get_mtd_snapshot(companyId, kpiId?)` | Latest MTD estimates |
| `compare_periods(companyId, kpiId, period1, period2)` | YOY/MOM delta between two months |
| `publish_estimate(companyId, kpiId, periodMonth, estimateValue, estimateType)` | Insert new estimate |

### Connecting to Claude Desktop

1. Build the backend:
   ```bash
   npm run build --workspace=backend
   ```

2. Open Claude Desktop → **Settings → Developer → Edit Config** to find your config file path, then add the `mcpServers` block. Config file locations:

   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows (direct install)**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Windows (Microsoft Store install)**: `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`

   Add this to your config (merge with existing content, don't replace it):

   **macOS / Linux:**
   ```json
   {
     "mcpServers": {
       "yipitdata-kpi": {
         "command": "node",
         "args": ["/path/to/yipitdata-kpi/backend/dist/mcp/server.js"]
       }
     }
   }
   ```

   **Windows:**
   ```json
   {
     "mcpServers": {
       "yipitdata-kpi": {
         "command": "node",
         "args": ["C:\\path\\to\\yipitdata-kpi\\backend\\dist\\mcp\\server.js"]
       }
     }
   }
   ```
   > **Note:** Replace `/path/to/yipitdata-kpi` with the absolute path to where you cloned this repo.

3. Make sure the backend is running (`npm run dev`), then fully restart Claude Desktop.

4. The server will appear as **running** under Settings → Developer. Claude will automatically use the tools when you ask about KPI data — no hammer icon click needed.

### Connecting to Cursor

Add to Cursor's MCP settings (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "yipitdata-kpi": {
      "command": "node",
      "args": ["/path/to/yipitdata-kpi/backend/dist/mcp/server.js"]
    }
  }
}
```
> **Note:** Replace `/path/to/yipitdata-kpi` with the absolute path to where you cloned this repo.

### Example MCP Interactions

> "List all companies available in the YipitData KPI system"
→ Agent calls `list_companies()` → returns all 6 companies grouped by sector

> "Compare Trendy Shoe Brand's GMV between May 2025 and May 2026, and show their current MTD estimate"
→ Agent calls `list_kpis()` to resolve GMV id, then calls `compare_periods(companyId=1, kpiId=1, period1="2025-05-01", period2="2026-05-01")` and `get_mtd_snapshot(companyId=1, kpiId=1)` in parallel → returns YOY table + MTD value with as-of timestamp

> "Which company in the Footwear sector has the highest GMV last month?"
→ Agent calls `list_companies(sector="footwear")`, then `get_estimates()` for each → compares and ranks

> "Publish a new MTD estimate for Nike's Units Sold of 4,200,000 for June 2026"
→ Agent calls `list_companies(search="Nike")`, `list_kpis()`, then `publish_estimate(companyId=2, kpiId=2, periodMonth="2026-06-01", estimateValue=4200000, estimateType="mtd")` → triggers SSE notification to all connected web UI users

---

## Key Architectural Decisions

### 1. Monorepo with npm workspaces
A single repo with `shared/`, `backend/`, and `frontend/` workspaces means TypeScript types flow from DB schema → API response → React component with zero duplication. A change to `KpiEstimate` in shared propagates compile-time errors immediately.

### 2. SSE over WebSockets for notifications
The notification requirement is one-directional (server → client). SSE is simpler: no upgrade handshake, native `EventSource` browser support, works through HTTP/1.1 proxies. The `SseManager` class is a plain `Map<clientId, FastifyReply>` — no pub/sub infrastructure needed at this scale.

### 3. Drizzle ORM over Prisma
Drizzle's schema file IS the source of truth for both TypeScript types and SQL migrations. No separate `schema.prisma` → codegen step. Push-based migrations (`drizzle-kit push`) are faster for development iteration.

### 4. MCP on stdio transport
Stdio is the most widely supported MCP transport (Claude Desktop, Cursor, VSCode MCP extension all support it out of the box). No auth layer needed since the process is spawned by the AI client itself on the local machine.

### 5. JWT in localStorage (assessment scope)
For this assessment, JWT is stored in `localStorage` for simplicity. In production, `httpOnly` cookies would prevent XSS token theft.

---

## Seed Data

- **3 sectors**: Footwear, Apparel, Electronics
- **6 companies**: Trendy Shoe Brand, Nike, Adidas, Zara, H&M, Samsung
- **3 KPIs**: GMV (USD), Units Sold (units), ASP (USD)
- **13 months** of historical estimates per (company, KPI) with seasonal variation
- **1 MTD** estimate per (company, KPI) at current month
- Total: **252 estimate rows**

---

## Future Improvements

### Observability
- **Structured logging** with correlation IDs (request → DB query → SSE event chain)
- **Prometheus metrics** via `fastify-metrics`: p95 latency per route, SSE client count gauge, estimate publish rate
- **Distributed tracing** with OpenTelemetry for the full request path
- **Error alerting** via Sentry or Datadog

### Performance & Scalability
- **Read replicas**: Separate the heavy `GET /estimates` queries to a read replica
- **Redis for SSE fan-out**: Replace in-process `SseManager` with Redis pub/sub so the app can scale horizontally (multiple backend instances)
- **Query result caching**: Cache 13-month estimate series in Redis with TTL invalidation on new estimate publish
- **Pagination**: Add cursor-based pagination to `/companies` and `/estimates` endpoints
- **Streaming responses**: Stream large estimate datasets using NDJSON instead of buffering full JSON

### Features
- **Anomaly detection**: Flag estimates that deviate >2σ from the trailing 3-month average
- **Watchlist**: Users can subscribe to specific (company, KPI) pairs and receive targeted notifications
- **Estimate diff view**: Side-by-side view of revised estimates vs previous values
- **Role-based access control**: Restrict which sectors/companies are visible per user tier
- **Audit log**: Immutable record of who published what estimate and when (critical for compliance)
- **Webhooks**: Outbound webhook on `NEW_ESTIMATE` for customers' own integrations
- **MCP authentication**: Add JWT verification to the MCP server so it can be deployed as a remote HTTP MCP server
- **Data quality indicators**: Confidence scores and revision history per estimate

### Infrastructure
- **Docker Compose** for reproducible local dev (Postgres + backend + frontend in one command)
- **CI/CD**: GitHub Actions pipeline: lint → test → build → deploy
- **Database connection pooling**: PgBouncer in front of PostgreSQL for production load
- **Rate limiting**: `@fastify/rate-limit` on `/auth/login` to prevent brute force
