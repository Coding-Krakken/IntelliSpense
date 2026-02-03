# IntelliSpense System Model

**Last Updated:** February 3, 2026  
**Status:** Canonical Data Model - Engineering Contract  
**Owner:** Architecture Team

---

## Purpose

This document defines the **authoritative data model** for IntelliSpense. All implementations (database schemas, TypeScript types, API contracts) must conform to this model.

**This is the single source of truth for:**
- Core entities and their attributes
- Relationships and cardinality
- State machines and valid transitions
- Events and their immutable schemas
- Business constraints and invariants
- Permission model

---

## Core Entities

### Organization

**Purpose:** Multi-tenant isolation boundary. All data belongs to exactly one Organization.

**Attributes:**
- `id` (UUID, Primary Key)
- `name` (String, required, max 200 chars)
- `slug` (String, unique, URL-safe identifier, e.g., "acme-construction")
- `industry` (Enum: CONSTRUCTION, CONSULTING, AGENCY, SAAS, RETAIL, MANUFACTURING, OTHER)
- `size` (Enum: SOLO (1-5), SMALL (6-50), MEDIUM (51-250), LARGE (251-1000), ENTERPRISE (1000+))
- `settings` (JSON: notification preferences, default allocation rules, currency, timezone)
- `subscriptionTier` (Enum: FREE, STARTER, PROFESSIONAL, ENTERPRISE)
- `subscriptionStatus` (Enum: ACTIVE, TRIAL, SUSPENDED, CANCELLED)
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

**Relationships:**
- Has many: Users, Projects, FinancialEvents, Integrations
- Has one: Owner (User)

**Constraints:**
- `slug` must be globally unique
- At least one User with Owner role
- Cannot delete if active Projects exist

---

### User

**Purpose:** Individual accessing the system, associated with one or more Organizations.

**Attributes:**
- `id` (UUID, Primary Key)
- `email` (String, unique, required)
- `name` (String, required)
- `avatarUrl` (String, nullable)
- `authProvider` (Enum: EMAIL, GOOGLE, MICROSOFT, OKTA, SAML)
- `authProviderId` (String, external auth system ID)
- `emailVerified` (Boolean, default false)
- `mfaEnabled` (Boolean, default false)
- `mfaSecret` (String, encrypted, nullable)
- `passwordHash` (String, encrypted, nullable for OAuth users)
- `lastLoginAt` (Timestamp, nullable)
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

**Relationships:**
- Belongs to many: Organizations (via OrganizationMembership)
- Has many: FinancialEvents (as creator), AIDecisions (as reviewer)

**Constraints:**
- `email` must be valid format
- If `authProvider = EMAIL`, must have `passwordHash`
- Cannot delete if User is only Owner of Organization

---

### OrganizationMembership

**Purpose:** Join table defining User's role within Organization.

**Attributes:**
- `id` (UUID, Primary Key)
- `organizationId` (UUID, Foreign Key → Organization)
- `userId` (UUID, Foreign Key → User)
- `role` (Enum: OWNER, ADMIN, PROJECT_MANAGER, ACCOUNTANT, VIEWER)
- `permissions` (JSON Array: granular permissions beyond role, e.g., ["projects:123:write"])
- `invitedBy` (UUID, Foreign Key → User, nullable)
- `invitedAt` (Timestamp, nullable)
- `joinedAt` (Timestamp, when user accepted invite)
- `createdAt` (Timestamp)

**Relationships:**
- Belongs to: Organization, User

**Constraints:**
- Unique index on (organizationId, userId)
- Organization must have at least one OWNER
- Role hierarchy: OWNER > ADMIN > PROJECT_MANAGER > ACCOUNTANT > VIEWER

---

### Project

**Purpose:** Container for all financial tracking, represents a job, contract, or cost center.

**Attributes:**
- `id` (UUID, Primary Key)
- `organizationId` (UUID, Foreign Key → Organization)
- `name` (String, required, max 200 chars)
- `code` (String, optional, user-defined identifier like "P-2026-014")
- `clientId` (UUID, Foreign Key → Client, nullable)
- `status` (Enum: PLANNED, ACTIVE, ON_HOLD, COMPLETED, CANCELLED)
- `startDate` (Date, nullable)
- `endDate` (Date, nullable, estimated or actual)
- `budget` (Decimal, nullable, total project budget)
- `description` (Text, optional)
- `metadata` (JSON: custom fields per industry, e.g., site address, contract number)
- `managerId` (UUID, Foreign Key → User, nullable)
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)
- `completedAt` (Timestamp, nullable)

**Relationships:**
- Belongs to: Organization, Client (optional), Manager (User)
- Has many: Tasks, FinancialEvents, ProjectProfitabilitySnapshots

**Constraints:**
- `code` unique within Organization (if provided)
- `endDate` >= `startDate` (if both provided)
- Cannot transition COMPLETED → ACTIVE (one-way)
- Cannot delete if FinancialEvents exist (soft delete via status)

**Derived Attributes (calculated, not stored):**
- `currentMargin` (from ProfitabilityEngine)
- `percentComplete` (from Tasks or time elapsed)
- `projectedMargin` (AI forecast)

---

### Task

**Purpose:** Sub-division of Project for granular cost tracking (e.g., phases, milestones, work packages).

**Attributes:**
- `id` (UUID, Primary Key)
- `projectId` (UUID, Foreign Key → Project)
- `name` (String, required)
- `description` (Text, optional)
- `phase` (String, optional, e.g., "Foundation", "Framing", "Discovery", "Design")
- `estimatedHours` (Decimal, nullable)
- `estimatedCost` (Decimal, nullable)
- `startDate` (Date, nullable)
- `endDate` (Date, nullable)
- `status` (Enum: NOT_STARTED, IN_PROGRESS, COMPLETED, CANCELLED)
- `parentTaskId` (UUID, Foreign Key → Task, nullable for hierarchy)
- `sortOrder` (Integer, for UI ordering)
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

**Relationships:**
- Belongs to: Project, ParentTask (optional)
- Has many: ChildTasks, FinancialEvents

**Constraints:**
- Task hierarchy max depth: 3 levels
- Cannot have circular parent references
- `status` cannot regress (COMPLETED → IN_PROGRESS violates audit)

---

### Client

**Purpose:** External entity Projects are performed for (customer, client, customer).

**Attributes:**
- `id` (UUID, Primary Key)
- `organizationId` (UUID, Foreign Key → Organization)
- `name` (String, required)
- `code` (String, optional, user-defined identifier)
- `industry` (Enum, optional)
- `contactName` (String, optional)
- `contactEmail` (String, optional)
- `contactPhone` (String, optional)
- `address` (JSON, optional: street, city, state, zip, country)
- `billingAddress` (JSON, optional, same structure)
- `paymentTerms` (String, optional, e.g., "Net 30")
- `metadata` (JSON, custom fields)
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

**Relationships:**
- Belongs to: Organization
- Has many: Projects

**Constraints:**
- `name` unique within Organization
- Cannot delete if active Projects exist

---

### Employee

**Purpose:** Labor resource with associated cost rates (may or may not be a User).

**Attributes:**
- `id` (UUID, Primary Key)
- `organizationId` (UUID, Foreign Key → Organization)
- `userId` (UUID, Foreign Key → User, nullable, if employee is also system user)
- `name` (String, required)
- `employeeCode` (String, optional, payroll system identifier)
- `role` (String, e.g., "Project Manager", "Electrician", "Designer")
- `department` (String, optional)
- `hourlyRate` (Decimal, nullable, default billing/cost rate)
- `overtimeRate` (Decimal, nullable, typically 1.5x hourlyRate)
- `hireDate` (Date, optional)
- `terminationDate` (Date, optional)
- `status` (Enum: ACTIVE, ON_LEAVE, TERMINATED)
- `metadata` (JSON: certifications, equipment, etc.)
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

**Relationships:**
- Belongs to: Organization, User (optional)
- Has many: FinancialEvents (labor costs)

**Constraints:**
- `hourlyRate` must be >= 0
- `terminationDate` >= `hireDate` (if both provided)
- Cannot delete (historical data dependency), only mark TERMINATED

---

### CostCenter

**Purpose:** Overhead or shared cost category with allocation rules.

**Attributes:**
- `id` (UUID, Primary Key)
- `organizationId` (UUID, Foreign Key → Organization)
- `name` (String, required, e.g., "Office Rent", "Admin Salaries", "Software Licenses")
- `type` (Enum: OVERHEAD, ADMINISTRATIVE, EQUIPMENT, FACILITY, OTHER)
- `allocationRule` (JSON: defines how to distribute costs across Projects)
  - `method` (Enum: EQUAL, REVENUE_BASED, LABOR_HOURS, CUSTOM_FORMULA)
  - `parameters` (JSON: method-specific config)
- `isActive` (Boolean, default true)
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

**Relationships:**
- Belongs to: Organization
- Has many: FinancialEvents (overhead costs)

**Constraints:**
- `allocationRule` must validate against schema
- `name` unique within Organization

**Example Allocation Rules:**
```json
{
  "method": "REVENUE_BASED",
  "parameters": {
    "minimumRevenue": 1000,
    "excludeStatuses": ["CANCELLED"]
  }
}
```

```json
{
  "method": "CUSTOM_FORMULA",
  "parameters": {
    "formula": "(laborHours / totalLaborHours) * cost",
    "variables": ["laborHours", "totalLaborHours", "cost"]
  }
}
```

---

### FinancialEvent

**Purpose:** Immutable ledger of all financial activity. Core of event-sourced architecture.

**Attributes:**
- `id` (UUID, Primary Key)
- `organizationId` (UUID, Foreign Key → Organization)
- `eventType` (Enum: REVENUE, LABOR_COST, MATERIAL_COST, OVERHEAD_COST, EQUIPMENT_COST, SUBCONTRACTOR_COST, ADJUSTMENT, FORECAST)
- `timestamp` (Timestamp with nanosecond precision, required)
- `amount` (Decimal(19, 4), required, signed: positive for revenue/negative for costs)
- `currency` (String, ISO 4217 code, default "USD")
- `projectId` (UUID, Foreign Key → Project, nullable for org-level events)
- `taskId` (UUID, Foreign Key → Task, nullable)
- `employeeId` (UUID, Foreign Key → Employee, nullable)
- `clientId` (UUID, Foreign Key → Client, nullable)
- `costCenterId` (UUID, Foreign Key → CostCenter, nullable)
- `description` (String, max 500 chars, human-readable summary)
- `metadata` (JSON: flexible storage for event-specific data)
  - `hours` (for LABOR_COST)
  - `quantity` (for MATERIAL_COST)
  - `invoiceNumber` (for REVENUE)
  - `vendorName` (for MATERIAL/SUBCONTRACTOR_COST)
- `sourceSystem` (String, e.g., "quickbooks", "toggl", "manual", "ai_attribution")
- `sourceId` (String, external system identifier for idempotency)
- `correctsEventId` (UUID, Foreign Key → FinancialEvent, nullable, for ADJUSTMENT events)
- `validFrom` (Timestamp, for temporal queries, defaults to timestamp)
- `validTo` (Timestamp, nullable, NULL means still valid)
- `createdBy` (UUID, Foreign Key → User)
- `createdAt` (Timestamp, system time of creation, distinct from `timestamp`)
- `version` (Integer, for optimistic locking)

**Relationships:**
- Belongs to: Organization, Project (optional), Task (optional), Employee (optional), Client (optional), CostCenter (optional)
- References: CorrectingEvent (for retroactive corrections)

**Constraints:**
- IMMUTABLE: No UPDATE or DELETE allowed
- Unique index on (organizationId, sourceSystem, sourceId) for idempotency
- `amount` precision: 4 decimal places (handles fractional cents)
- `timestamp` cannot be future date (except FORECAST events)
- If `correctsEventId` is set, `eventType` must be ADJUSTMENT
- `validFrom` <= `validTo` (if validTo is set)

**Event Type Semantics:**
- **REVENUE**: Income from client (invoices, payments)
- **LABOR_COST**: Employee time costs (hours × rate)
- **MATERIAL_COST**: Physical goods purchased for project
- **OVERHEAD_COST**: Shared costs allocated across projects
- **EQUIPMENT_COST**: Tool rental, machinery
- **SUBCONTRACTOR_COST**: External labor
- **ADJUSTMENT**: Corrects previous event (references `correctsEventId`)
- **FORECAST**: Predicted future cost/revenue (not actual)

---

### ProjectProfitabilitySnapshot

**Purpose:** Materialized view of profitability calculations for performance and historical tracking.

**Attributes:**
- `id` (UUID, Primary Key)
- `projectId` (UUID, Foreign Key → Project)
- `calculatedAt` (Timestamp, when snapshot was computed)
- `asOfDate` (Date, the point in time this represents)
- `totalRevenue` (Decimal)
- `totalLaborCost` (Decimal)
- `totalMaterialCost` (Decimal)
- `totalOverheadCost` (Decimal)
- `totalEquipmentCost` (Decimal)
- `totalSubcontractorCost` (Decimal)
- `totalCosts` (Decimal, sum of all cost categories)
- `margin` (Decimal, totalRevenue - totalCosts)
- `marginPercentage` (Decimal, (margin / totalRevenue) × 100)
- `eventCount` (Integer, number of events included)
- `lastEventId` (UUID, Foreign Key → FinancialEvent, for incremental updates)

**Relationships:**
- Belongs to: Project

**Constraints:**
- Unique index on (projectId, asOfDate)
- Can be deleted/recomputed (derived data, not source of truth)
- `totalCosts` = sum of all cost categories (database check constraint)

**Invalidation:**
- New FinancialEvent → Invalidate snapshots where `asOfDate` >= event.timestamp
- Recalculate in background worker

---

### Integration

**Purpose:** Configuration for third-party system connections.

**Attributes:**
- `id` (UUID, Primary Key)
- `organizationId` (UUID, Foreign Key → Organization)
- `type` (Enum: QUICKBOOKS, XERO, TOGGL, HARVEST, PLAID, GUSTO, ADP, PROCORE, STRIPE, GENERIC_OAUTH)
- `name` (String, user-defined, e.g., "Acme QuickBooks")
- `status` (Enum: CONNECTED, DISCONNECTED, ERROR, PENDING_AUTH)
- `credentials` (JSON, encrypted, OAuth tokens, API keys)
  - `accessToken` (String, encrypted)
  - `refreshToken` (String, encrypted)
  - `expiresAt` (Timestamp)
- `configuration` (JSON: integration-specific settings)
  - `syncFrequency` (Integer, minutes)
  - `entityMappings` (JSON: external ID → internal ID)
- `lastSyncAt` (Timestamp, nullable)
- `lastSyncStatus` (Enum: SUCCESS, PARTIAL, FAILED)
- `errorMessage` (Text, nullable, last error details)
- `createdBy` (UUID, Foreign Key → User)
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

**Relationships:**
- Belongs to: Organization
- Has many: SyncLogs

**Constraints:**
- `type` unique per Organization (e.g., only one QuickBooks connection)
- `credentials` must be encrypted at-rest
- Cannot delete if recent SyncLogs exist (retain for audit)

---

### SyncLog

**Purpose:** Audit trail of integration synchronization attempts.

**Attributes:**
- `id` (UUID, Primary Key)
- `integrationId` (UUID, Foreign Key → Integration)
- `startedAt` (Timestamp)
- `completedAt` (Timestamp, nullable)
- `status` (Enum: RUNNING, SUCCESS, PARTIAL_SUCCESS, FAILED, CANCELLED)
- `direction` (Enum: PULL (external → IntelliSpense), PUSH (IntelliSpense → external))
- `syncType` (Enum: FULL, INCREMENTAL, MANUAL)
- `recordsSynced` (Integer, count of events created)
- `recordsFailed` (Integer, count of errors)
- `errors` (JSON Array: detailed error messages)
- `metadata` (JSON: sync-specific details like watermark, duration)

**Relationships:**
- Belongs to: Integration

**Constraints:**
- `completedAt` >= `startedAt` (if set)
- Retention: Keep for 90 days, archive older

---

### AIDecision

**Purpose:** Audit log of all AI-generated outputs for traceability and learning.

**Attributes:**
- `id` (UUID, Primary Key)
- `organizationId` (UUID, Foreign Key → Organization)
- `decisionType` (Enum: COST_ATTRIBUTION, EXPLANATION, FORECAST, ANOMALY_DETECTION, RECOMMENDATION)
- `inputContext` (JSON: all data sent to AI)
  - `prompt` (String)
  - `contextData` (JSON)
  - `parameters` (JSON)
- `output` (JSON: AI response)
  - `result` (varies by type)
  - `reasoning` (String, explanation)
  - `sources` (Array of event/entity IDs)
  - `confidence` (Decimal, 0-1)
- `modelVersion` (String, e.g., "claude-3-opus-20240229")
- `modelProvider` (Enum: ANTHROPIC, OPENAI, GOOGLE, LOCAL)
- `promptVersion` (String, git commit hash of prompt template)
- `latencyMs` (Integer, time to generate response)
- `tokenCount` (Integer, total tokens used)
- `userReview` (Enum: APPROVED, REJECTED, MODIFIED, PENDING, nullable)
- `userFeedback` (Text, nullable, why user modified/rejected)
- `appliedEventId` (UUID, Foreign Key → FinancialEvent, if AI decision created event)
- `createdAt` (Timestamp)

**Relationships:**
- Belongs to: Organization
- May create: FinancialEvent (if approved)

**Constraints:**
- `confidence` between 0 and 1
- `inputContext` and `output` must be valid JSON
- Cannot delete (compliance requirement for audit)
- Retention: 3 years

**Example - Cost Attribution:**
```json
{
  "inputContext": {
    "prompt": "Allocate $5000 office rent across active projects",
    "contextData": {
      "costCenterId": "uuid-123",
      "amount": 5000,
      "projects": [
        {"id": "uuid-p1", "revenue": 100000, "laborHours": 500},
        {"id": "uuid-p2", "revenue": 50000, "laborHours": 200}
      ]
    },
    "parameters": {
      "method": "REVENUE_BASED"
    }
  },
  "output": {
    "result": [
      {"projectId": "uuid-p1", "amount": 3333.33, "percentage": 66.67},
      {"projectId": "uuid-p2", "amount": 1666.67, "percentage": 33.33}
    ],
    "reasoning": "Allocated based on revenue proportion: Project 1 generated 66.67% of total revenue ($100k / $150k), Project 2 generated 33.33%.",
    "sources": ["uuid-p1", "uuid-p2", "uuid-123"],
    "confidence": 0.92
  },
  "modelVersion": "claude-3-opus-20240229"
}
```

---

### Notification

**Purpose:** User alerts for margin changes, anomalies, integrations.

**Attributes:**
- `id` (UUID, Primary Key)
- `organizationId` (UUID, Foreign Key → Organization)
- `userId` (UUID, Foreign Key → User, nullable for org-wide notifications)
- `type` (Enum: MARGIN_ALERT, BUDGET_EXCEEDED, ANOMALY_DETECTED, INTEGRATION_FAILED, INVOICE_DUE)
- `priority` (Enum: LOW, MEDIUM, HIGH, CRITICAL)
- `title` (String, max 200 chars)
- `message` (Text)
- `actionUrl` (String, deeplink to relevant UI, nullable)
- `relatedEntityType` (Enum: PROJECT, EVENT, INTEGRATION, nullable)
- `relatedEntityId` (UUID, nullable)
- `status` (Enum: UNREAD, READ, DISMISSED, ACTIONED)
- `deliveryChannels` (JSON Array: ["IN_APP", "EMAIL", "PUSH", "DESKTOP"])
- `deliveredAt` (Timestamp, nullable)
- `readAt` (Timestamp, nullable)
- `createdAt` (Timestamp)

**Relationships:**
- Belongs to: Organization, User (optional)

**Constraints:**
- `readAt` >= `deliveredAt` (if both set)
- `status` transitions: UNREAD → READ → DISMISSED/ACTIONED (one-way)
- Retention: Delete after 90 days if READ or DISMISSED

---

## Relationships Summary

```
Organization
├── Users (many-to-many via OrganizationMembership)
├── Projects
│   ├── Tasks
│   ├── FinancialEvents
│   └── ProfitabilitySnapshots
├── Clients
│   └── Projects
├── Employees
│   └── FinancialEvents (labor)
├── CostCenters
│   └── FinancialEvents (overhead)
├── Integrations
│   └── SyncLogs
├── AIDecisions
└── Notifications
```

**Cardinality:**
- Organization : User = M:N (via OrganizationMembership)
- Organization : Project = 1:N
- Project : Task = 1:N (hierarchical)
- Project : FinancialEvent = 1:N
- Organization : FinancialEvent = 1:N
- Employee : FinancialEvent = 1:N
- Client : Project = 1:N

---

## Events

**Event-Sourced Architecture:** All state changes to financial data represented as immutable events.

### Event Categories

#### 1. Financial Events (FinancialEvent entity)
Already defined in core entities. These are the primary events.

#### 2. System Events (for observability, not stored in FinancialEvent table)

**ProjectStatusChanged**
- `projectId`, `oldStatus`, `newStatus`, `changedBy`, `timestamp`

**UserInvited**
- `organizationId`, `email`, `role`, `invitedBy`, `timestamp`

**IntegrationConnected**
- `integrationId`, `type`, `connectedBy`, `timestamp`

**ProfitabilityRecalculated**
- `projectId`, `oldMargin`, `newMargin`, `triggeringEventId`, `timestamp`

**AnomalyDetected**
- `eventId`, `anomalyType`, `severity`, `timestamp`

These system events stored in separate `SystemEventLog` table for observability, not part of financial ledger.

---

## State Machines

### Project Status State Machine

```
PLANNED → ACTIVE → COMPLETED
  ↓         ↓
ON_HOLD ← ←
  ↓         ↓
CANCELLED   ←
```

**Valid Transitions:**
- PLANNED → ACTIVE (project starts)
- PLANNED → ON_HOLD (delayed)
- PLANNED → CANCELLED (rejected)
- ACTIVE → ON_HOLD (paused)
- ACTIVE → COMPLETED (finished successfully)
- ACTIVE → CANCELLED (terminated early)
- ON_HOLD → ACTIVE (resumed)
- ON_HOLD → CANCELLED (abandoned)

**Invalid Transitions:**
- COMPLETED → any (terminal state)
- CANCELLED → any (terminal state)

**Enforcement:** Database trigger or application-level validation

---

### Task Status State Machine

```
NOT_STARTED → IN_PROGRESS → COMPLETED
      ↓              ↓
  CANCELLED    ←   ←
```

**Valid Transitions:**
- NOT_STARTED → IN_PROGRESS
- NOT_STARTED → CANCELLED
- IN_PROGRESS → COMPLETED
- IN_PROGRESS → CANCELLED

**Invalid Transitions:**
- COMPLETED → any (terminal)
- CANCELLED → any (terminal)
- IN_PROGRESS → NOT_STARTED (cannot regress)

---

### Integration Status State Machine

```
PENDING_AUTH → CONNECTED ⇄ DISCONNECTED
                    ↓
                 ERROR
```

**Valid Transitions:**
- PENDING_AUTH → CONNECTED (OAuth complete)
- PENDING_AUTH → ERROR (auth failed)
- CONNECTED → DISCONNECTED (user disconnects)
- CONNECTED → ERROR (sync failure)
- DISCONNECTED → CONNECTED (user reconnects)
- ERROR → CONNECTED (error resolved)

---

### Notification Status State Machine

```
UNREAD → READ → DISMISSED
          ↓
       ACTIONED
```

**Valid Transitions:**
- UNREAD → READ (user views)
- READ → DISMISSED (user dismisses)
- READ → ACTIONED (user takes action via notification)

**Invalid Transitions:**
- Any backward transition (one-way flow)

---

## Business Constraints

### Financial Integrity Constraints

**C1: Currency Consistency**
- All FinancialEvents for a Project must use same currency
- Currency conversion if needed happens at ingestion time

**C2: Temporal Consistency**
- `event.timestamp` cannot be > 24 hours in future (prevents unrealistic forecasts)
- `event.timestamp` cannot be > 7 years in past (data quality check)

**C3: Amount Precision**
- All amounts stored with 4 decimal precision (handles fractional cents)
- Display rounds to 2 decimals (cents), but calculations use full precision

**C4: Margin Calculation**
```
Margin = Revenue - (Labor + Materials + Overhead + Equipment + Subcontractors)
MarginPercentage = (Margin / Revenue) × 100
```
- Division by zero: If Revenue = 0, MarginPercentage = NULL
- Formula is immutable across system

**C5: Event Idempotency**
- Duplicate events from external systems must not create duplicate entries
- Enforced by unique index on (organizationId, sourceSystem, sourceId)

---

### Authorization Constraints

**C6: Data Isolation**
- User can only access data where `user.organizationIds` ∩ `entity.organizationId`
- Queries must always filter by authenticated user's organizationId
- Database views enforce isolation (no raw table access)

**C7: Role Permissions**

| Role | Projects | Events | Integrations | Users | Settings |
|------|----------|--------|--------------|-------|----------|
| VIEWER | Read | Read | - | - | - |
| ACCOUNTANT | Read | Read, Write | Read | - | - |
| PROJECT_MANAGER | Read, Write | Read, Write | - | - | Read |
| ADMIN | Full | Full | Full | Read, Write | Full |
| OWNER | Full | Full | Full | Full | Full |

Granular permissions can override (stored in `OrganizationMembership.permissions`)

**C8: Sensitive Data Access**
- Only OWNER and ADMIN can view full financial reports
- PROJECT_MANAGER sees only projects they manage
- ACCOUNTANT sees all financial data but cannot modify projects
- VIEWER cannot create/modify events

---

### Integration Constraints

**C9: Sync Frequency Limits**
- Minimum sync interval: 5 minutes (prevent API abuse)
- Maximum sync interval: 24 hours (keep data fresh)
- Manual sync: No rate limit (user-initiated)

**C10: Data Source Priority**
- If same event exists in multiple sources, priority:
  1. QuickBooks (accounting system of record)
  2. Payroll system (for labor costs)
  3. Time tracking (for hours worked)
  4. Manual entry (lowest priority, user-created)

**C11: Integration Isolation**
- Each organization can connect only one instance per integration type
- Exception: Multiple bank accounts via Plaid (multi-connection allowed)

---

### AI Constraints

**C12: AI Decision Approval**
- AI cannot create FinancialEvents without user approval
- Exception: User pre-approves pattern ("Always allocate rent by revenue")
- Pre-approved patterns stored in Organization.settings

**C13: Confidence Thresholds**
- Confidence < 0.7: Show as "Suggested" (not definitive)
- Confidence < 0.5: Require user review before displaying
- Confidence >= 0.9: Show as "High Confidence"

**C14: AI Traceability**
- Every AI output logged in AIDecision table
- Must include: input, output, model version, reasoning, sources
- Cannot delete AIDecision records (compliance)

---

## Permission Model

### Hierarchical Permissions

**Structure:** `resource:action`

**Resources:**
- `projects` (Projects and Tasks)
- `events` (FinancialEvents)
- `integrations` (Integrations and SyncLogs)
- `users` (Users and Memberships)
- `settings` (Organization settings)
- `reports` (Generated reports)
- `ai` (AI decisions and copilot)

**Actions:**
- `read` (view data)
- `write` (create, modify)
- `delete` (remove data)
- `manage` (full control, including permissions)

**Examples:**
- `projects:read` - Can view all projects
- `events:write` - Can create/modify financial events
- `integrations:manage` - Can connect/disconnect integrations
- `users:manage` - Can invite/remove users

### Resource-Specific Permissions

**Project-Level:**
- `projects:{projectId}:read` - Can view specific project only
- Used for contractors with limited scope

**Event-Level:**
- `events:LABOR_COST:write` - Can only create labor cost events
- `events:REVENUE:read` - Can see revenue but not costs

### Permission Inheritance

```
OWNER
  └── implicitly has all permissions
      
ADMIN
  └── projects:*, events:*, integrations:*, users:write, settings:*
  
PROJECT_MANAGER
  └── projects:read, projects:write, events:read, events:write
  
ACCOUNTANT
  └── projects:read, events:*, reports:*
  
VIEWER
  └── projects:read, events:read, reports:read
```

**Custom Permissions:** Stored in `OrganizationMembership.permissions` as JSON array, additive only (cannot remove inherited permissions).

---

## Temporal Queries

### Point-in-Time Profitability

**Use Case:** "What was Project Alpha's margin on January 15, 2026?"

**Query Logic:**
```sql
SELECT SUM(amount) FROM FinancialEvent
WHERE projectId = 'alpha'
  AND timestamp <= '2026-01-15 23:59:59'
  AND validFrom <= '2026-01-15 23:59:59'
  AND (validTo IS NULL OR validTo > '2026-01-15 23:59:59')
```

**Explanation:**
- `timestamp`: When event originally occurred
- `validFrom`: When this version of the event became valid
- `validTo`: When this version was superseded (NULL = still valid)

**Retroactive Corrections:**
- Original event: `timestamp = Jan 10, validFrom = Jan 10, validTo = NULL`
- Correction created Jan 20: Original event `validTo = Jan 20`
- Adjustment event: `timestamp = Jan 10, validFrom = Jan 20, validTo = NULL, correctsEventId = <original>`

**Result:** Query on Jan 15 uses original. Query on Jan 25 uses corrected version.

---

## Data Integrity Checks

### Required Integrity Tests

**T1: Sum Invariants**
- `ProjectProfitabilitySnapshot.totalCosts` = sum of all cost categories
- Run nightly, alert if mismatch

**T2: Orphan Detection**
- No FinancialEvents with projectId pointing to non-existent Project
- No Tasks with projectId pointing to non-existent Project

**T3: Currency Mismatch**
- All events for Project must have same currency
- Flag for manual review if violation detected

**T4: Multi-Tenant Leakage**
- No queries returning data crossing organizationId boundaries
- Tested via integration tests with multiple orgs

**T5: Immutability Verification**
- No UPDATE/DELETE on FinancialEvent table (except validTo for corrections)
- Database triggers block violations

---

## Schema Evolution Guidelines

### Adding New Attributes
- **Backwards compatible:** Add as nullable or with default value
- **Update:** `SYSTEM_MODEL.md` first, then schema migration
- **API:** New fields optional in v1, can make required in v2

### Modifying Existing Attributes
- **Breaking change:** Requires API version bump
- **Data migration:** Backfill existing records if changing nullability
- **Deprecation:** Mark old field deprecated, support for 6 months

### Adding New Event Types
- **Extend enum:** Add to `FinancialEvent.eventType`
- **Documentation:** Define semantics in this document
- **Backwards compatible:** Old clients ignore unknown types

### Removing Attributes
- **Never remove from database:** Mark as deprecated, stop using
- **API:** Remove from new API version, keep in old version for compatibility
- **Data retention:** Keep for audit requirements (7 years)

---

## Governance

**This document is authoritative for:**
- Database schema design (Prisma schema must match)
- API contracts (GraphQL/REST schemas must match)
- TypeScript types (generated from this model)
- Integration mappings (external → internal entity alignment)

**Change Process:**
1. Propose change via RFC (Request for Comments)
2. Update this document with rationale
3. Architecture Review Board approval
4. Update `DECISION_LOG.md`
5. Implement: Schema migration → Type generation → API updates
6. Update dependent docs (`WORKFLOWS.md`, `DEVELOPMENT_PLAYBOOK.md`)

**Conflict Resolution:**
- If code contradicts this model: Code is wrong
- If model is insufficient: Update model, then update code
- Never silently diverge

---

## Related Documents
- `PRINCIPLES.md` - Why this model is designed this way
- `WORKFLOWS.md` - How entities interact in canonical workflows
- `DEVELOPMENT_PLAYBOOK.md` - How to extend this model safely
