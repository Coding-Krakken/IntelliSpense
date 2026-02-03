# IntelliSpense Canonical Workflows

**Last Updated:** February 3, 2026  
**Status:** Workflow Specifications - Implementation Blueprint  
**Owner:** Product & Engineering Team

---

## Purpose

This document defines **canonical workflows** - the authoritative sequences of user actions and system responses that implement IntelliSpense's core value propositions.

**Each workflow specifies:**
- User goal and context
- Preconditions
- Step-by-step interaction flow
- System behavior at each step
- Success criteria
- Error paths and recovery
- Performance requirements
- Human vs automated decision points

**Why Canonical Workflows Matter:**
- Engineers know exactly what to build
- QA knows exactly what to test
- Product knows what user experience to design
- Support knows how features should work
- Prevents implementation drift from intent

---

## Workflow Categories

### 1. Core Value Workflows
Primary workflows that deliver product value

### 2. Data Ingestion Workflows
How financial data enters the system

### 3. Intelligence Workflows
AI-powered reasoning and explanations

### 4. Multi-Platform Workflows
Cross-device experiences

### 5. Administrative Workflows
Setup, configuration, management

---

## Core Value Workflows

### W001 - View Real-Time Project Profitability

**User Goal:** Check if project is making or losing money right now

**User Personas:** Owner, PM, Accountant, Executive

**Trigger:** User opens dashboard or selects project

**Preconditions:**
- User authenticated
- User has permission to view project
- Project has at least one FinancialEvent

**Performance Requirement:** Dashboard loads in <2s, updates in <5s on new event

---

**Flow: Web App**

1. **User navigates to /dashboard**
   - **System:** Queries local IndexedDB for cached profitability data
   - **System:** Displays cached data immediately (<500ms)
   - **System:** Opens WebSocket connection to API
   - **System:** Subscribes to profitability updates for user's projects

2. **System displays project list**
   - **UI Elements:**
     - Project name
     - Current margin % (color-coded: green >10%, yellow 0-10%, red <0%)
     - Trend indicator (↗ improving, → stable, ↘ declining)
     - Last updated timestamp
   - **Data:** From ProfitabilitySnapshot + real-time calculations

3. **User clicks project to drill down**
   - **System:** Navigates to /projects/[projectId]
   - **System:** Displays:
     - **Header:** Project name, status, dates, budget
     - **Profitability Card:**
       - Total revenue: $X
       - Total costs: $Y broken down (Labor, Materials, Overhead, Equipment, Subcontractors)
       - Margin: $Z (X - Y)
       - Margin %: (Z / X) × 100
     - **Trend Chart:** Margin over time (past 30 days)
     - **Forecast:** "Projected final margin: $W with 85% confidence"

4. **New event created (different user or integration)**
   - **System (Backend):**
     - Ingests event to FinancialEvent table
     - Publishes event to Redis channel
     - Triggers profitability recalculation for affected project
   - **System (Frontend):**
     - Receives WebSocket push with updated profitability
     - Animates margin change in UI (number increments/decrements with easing)
     - Shows toast: "Margin updated: New labor cost added"

5. **User wants explanation**
   - **User:** Clicks "Why?" button next to margin
   - **System:** Opens AI explanation panel (see W008)

**Success Criteria:**
- ✓ User sees current margin within 2 seconds
- ✓ Margin updates within 5 seconds of new event
- ✓ User can drill down to task-level costs
- ✓ Trend chart shows historical context

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| WebSocket disconnects | Network issues | Fallback to polling every 30 seconds, show "Offline" indicator |
| Profitability calculation fails | Data inconsistency | Show last known good value with "Recalculating..." status, retry |
| Project not found | Deleted or no permission | Redirect to dashboard with error message |

---

**Flow: Mobile App**

1. **User opens app**
   - **System:** Reads from local SQLite database
   - **System:** Displays cached project list (<500ms)
   - **System:** Triggers background sync if online

2. **Background sync runs**
   - **System:** Calls `/api/sync/pull?since=lastSyncTimestamp`
   - **System:** Receives new events since last sync
   - **System:** Inserts into SQLite, recalculates profitability
   - **System:** Updates UI with new margins

3. **User swipes down to refresh**
   - **System:** Forces immediate sync
   - **System:** Shows loading spinner
   - **System:** Updates UI when complete

4. **Offline behavior**
   - **System:** Shows all cached data
   - **System:** All reads work normally from SQLite
   - **System:** Badge indicates "Last synced: 2 hours ago"

**Success Criteria:**
- ✓ Works fully offline with cached data
- ✓ Syncs within 30 seconds when online
- ✓ Swipe-to-refresh provides manual sync

---

**Flow: Desktop App (System Tray)**

1. **User hovers over system tray icon**
   - **System:** Shows tooltip with overall margin % for all active projects

2. **User clicks tray icon**
   - **System:** Shows dropdown menu:
     - "Overall Margin: +12.3% ↗" (clickable)
     - Top 3 projects with margins
     - "View Dashboard" (opens main window)
     - "Sync Now"
     - "Settings"
     - "Quit"

3. **User clicks project in menu**
   - **System:** Opens main window to project detail view

4. **Background service detects margin drop**
   - **System:** Shows native OS notification: "⚠️ Project Alpha margin dropped to 3.2%"
   - **User:** Clicks notification
   - **System:** Opens app to Project Alpha detail view

**Success Criteria:**
- ✓ Tray shows key metrics without opening app
- ✓ Notifications alert to critical margin changes
- ✓ One-click navigation to problem areas

---

### W002 - Create Financial Event Manually

**User Goal:** Record a cost or revenue that wasn't automatically captured

**User Personas:** PM, Accountant, Owner

**Trigger:** User discovers a cost (receipt, invoice) not auto-synced

**Preconditions:**
- User has `events:write` permission
- Project exists

**Performance Requirement:** Event creation completes in <500ms

---

**Flow:**

1. **User navigates to project → "Add Cost" button**
   - **System:** Opens event creation modal/screen

2. **User fills form:**
   - **Event Type:** Dropdown (Revenue, Labor Cost, Material Cost, Equipment Cost, Subcontractor Cost, Overhead Cost)
   - **Amount:** Number input with currency symbol
   - **Date:** Date picker (defaults to today)
   - **Project:** Dropdown (all active projects)
   - **Task:** Dropdown (optional, tasks within selected project)
   - **Description:** Text input (max 500 chars)
   - **Vendor/Employee:** Autocomplete (optional, based on event type)
   - **Metadata:** Depends on event type:
     - Labor: Hours worked
     - Material: Quantity, unit
     - Revenue: Invoice number

3. **User submits form**
   - **System (Frontend):**
     - Validates required fields (amount, type, date)
     - Validates business rules (amount >= 0, date not future for actual costs)
     - Shows optimistic UI update (event appears in list immediately)
   
   - **System (Backend):**
     - Receives POST /api/events
     - Validates with Zod schema
     - Checks user permissions (can write to this project?)
     - Creates FinancialEvent:
       - `id` = UUID
       - `organizationId` = from JWT
       - `sourceSystem` = "manual"
       - `sourceId` = id (for idempotency)
       - `createdBy` = user.id
     - Publishes event to Redis channel
     - Returns 201 Created

   - **System (Async):**
     - Recalculates profitability for project
     - Invalidates ProfitabilitySnapshot cache
     - Generates new snapshot
     - Pushes update to subscribed clients

4. **System confirms**
   - **UI:** Shows success toast: "Cost added: $500 materials"
   - **UI:** Modal closes, event visible in event timeline
   - **UI:** Margin updates with animation

**Success Criteria:**
- ✓ Event created within 500ms
- ✓ Profitability reflects new event within 5s
- ✓ Event appears in timeline chronologically
- ✓ Event immutable (cannot be edited, only corrected)

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| Validation fails | Invalid amount, missing required field | Show inline error, highlight field, prevent submission |
| Permission denied | User lacks events:write for project | Show error: "You don't have permission to add costs to this project" |
| Duplicate event | Same sourceSystem + sourceId exists | Silently dedupe (idempotency), show success |
| Network failure (offline) | No internet connection | Queue locally, show "Pending sync" badge, retry when online |

---

### W003 - Correct a Financial Event

**User Goal:** Fix a mistake in a previously entered event

**User Personas:** Accountant, Owner

**Trigger:** User discovers event has wrong amount, date, or project

**Preconditions:**
- Original event exists
- User has permission to correct events
- Event is not already corrected (no validTo date)

**Performance Requirement:** Correction creates within 500ms

---

**Flow:**

1. **User finds incorrect event**
   - **Location:** Project event timeline or /events search

2. **User clicks "Correct" button**
   - **System:** Opens correction modal
   - **UI:** Shows original event details (read-only, grayed out)
   - **UI:** Shows correction form with same fields (pre-filled with original values)

3. **User modifies incorrect fields**
   - Example: Changes amount from $500 to $550
   - Example: Changes project from Alpha to Beta

4. **User submits correction**
   - **System (Frontend):**
     - Validates corrected values
     - Shows explanation field: "Why are you correcting this?"
   
   - **System (Backend):**
     - Sets original event `validTo = NOW()`
     - Creates new ADJUSTMENT event:
       - `correctsEventId` = original.id
       - `eventType` = ADJUSTMENT
       - New corrected values
       - `metadata.correctionReason` = user explanation
       - `validFrom` = NOW()
     - Returns both events (original marked superseded, new correction)

   - **System (Async):**
     - Recalculates profitability using new values
     - Temporal queries now use corrected event

5. **System displays result**
   - **UI:** Event timeline shows:
     - Original event with strikethrough
     - New corrected event with "Corrects event #123" badge
     - Explanation visible on hover
   - **UI:** Margin updates to reflect correction

**Success Criteria:**
- ✓ Original event preserved (immutable principle)
- ✓ Correction clearly marked and traceable
- ✓ Temporal queries use correct values
- ✓ Audit trail complete (who, when, why)

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| Event already corrected | validTo already set | Show error: "This event has already been corrected. Correct the most recent version." |
| Permission denied | User lacks correction permission | Show error with request approval flow |
| Validation fails | New values invalid | Inline validation errors |

---

### W004 - AI Cost Attribution

**User Goal:** Allocate shared overhead cost across projects fairly

**User Personas:** Accountant, Owner

**Trigger:** Overhead cost needs distribution (rent, software licenses, admin salaries)

**Preconditions:**
- CostCenter defined with allocation rules
- Multiple active projects exist
- User has approval authority

**Performance Requirement:** AI suggestion in <5s, allocation creation in <1s

---

**Flow:**

1. **System detects overhead cost**
   - **Trigger Options:**
     - Manual entry: User creates overhead event
     - Integration sync: QuickBooks syncs rent payment
     - Scheduled: Monthly admin salary allocation

2. **System invokes AI attribution**
   - **System (Backend):**
     - Queries relevant context:
       - All active projects (status, budget, revenue, labor hours)
       - CostCenter allocation rule (method preference)
       - Historical allocation patterns
     - Constructs prompt:
       ```
       Allocate $5,000 office rent across projects.
       
       Projects:
       - Alpha: $100k budget, $75k spent, 500 labor hours, Construction
       - Beta: $50k budget, $30k spent, 200 labor hours, Consulting
       - Gamma: $25k budget, $20k spent, 100 labor hours, Design
       
       Allocation method preference: REVENUE_BASED
       
       Return JSON with allocation per project, reasoning, confidence.
       ```
     - Calls Claude API (Opus for complex allocations)
     - Receives structured response

   - **AI Output Example:**
     ```json
     {
       "allocations": [
         {"projectId": "alpha", "amount": 2857.14, "percentage": 57.14},
         {"projectId": "beta", "amount": 1714.29, "percentage": 34.29},
         {"projectId": "gamma", "amount": 428.57, "percentage": 8.57}
       ],
       "reasoning": "Allocated proportionally to labor hours as proxy for space utilization. Alpha consumed 500/800 total hours (62.5%), but adjusted down slightly as construction work is partly off-site. Beta office-based consulting work weighted higher per hour.",
       "confidence": 0.87,
       "method": "LABOR_HOURS_ADJUSTED",
       "alternatives": [...]
     }
     ```

3. **System presents AI suggestion to user**
   - **UI:** Allocation review screen shows:
     - **Summary:** "AI suggests allocating $5k office rent"
     - **Table:**
       | Project | Amount | % | Reasoning |
       |---------|--------|---|-----------|
       | Alpha | $2,857 | 57% | Primary space user, large team |
       | Beta | $1,714 | 34% | Office-intensive work |
       | Gamma | $429 | 9% | Small team, partial remote |
     - **AI Confidence:** 87% (shown as meter)
     - **Full Reasoning:** Expandable text
     - **Actions:** [Approve] [Adjust] [Reject]

4. **User reviews and decides**
   
   **Option A: User approves**
   - **User:** Clicks [Approve]
   - **System:**
     - Creates 3 OVERHEAD_COST events (one per project)
     - Each event references AIDecision.id
     - Logs AIDecision with `userReview = APPROVED`
     - Updates profitability for all 3 projects
   - **UI:** Shows success: "Rent allocated across 3 projects"

   **Option B: User adjusts**
   - **User:** Clicks [Adjust] → Opens adjustment form
   - **User:** Modifies percentages manually (must sum to 100%)
   - **System:**
     - Logs AIDecision with `userReview = MODIFIED`
     - Stores user adjustments in `userFeedback`
     - Creates events with adjusted amounts
     - AI learns from correction for future allocations

   **Option C: User rejects**
   - **User:** Clicks [Reject] → Prompted for reason
   - **System:**
     - Logs AIDecision with `userReview = REJECTED`
     - No events created
     - User can manually allocate or request new AI suggestion

5. **Learning loop (async)**
   - **System:** Analyzes user modifications
   - **System:** Updates organization allocation patterns
   - **System:** Future allocations incorporate learned preferences

**Success Criteria:**
- ✓ AI provides reasonable allocation within 5s
- ✓ User can review, modify, or reject suggestion
- ✓ Reasoning is clear and specific
- ✓ System learns from user corrections
- ✓ Full audit trail of AI decision

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| AI timeout | Claude API slow/unavailable | Fallback to rule-based allocation (equal or last-used method), notify user "AI unavailable, using standard allocation" |
| Confidence too low (<0.5) | Insufficient context | Show warning: "Low confidence allocation. Review carefully or provide more project data." |
| Allocations don't sum to 100% | AI math error | Detect and auto-adjust largest allocation, flag for review |
| No active projects | All projects completed/cancelled | Error: "Cannot allocate overhead—no active projects. Create manual entry or add to future projects." |

---

## Data Ingestion Workflows

### W005 - QuickBooks Online Integration Sync

**User Goal:** Automatically pull financial data from QuickBooks

**User Personas:** Accountant, Owner

**Trigger:** Manual sync or scheduled sync (every hour)

**Preconditions:**
- QuickBooks integration connected (OAuth complete)
- Valid access token (not expired)

**Performance Requirement:** Initial sync <5 minutes, incremental sync <30 seconds

---

**Flow:**

1. **Sync triggered**
   - **Trigger Options:**
     - User clicks "Sync Now" in integrations page
     - Scheduled cron job (every 60 minutes)
     - Webhook from QuickBooks (transaction created)

2. **System initiates sync**
   - **System (Worker):**
     - Creates SyncLog record (status: RUNNING)
     - Retrieves Integration credentials (decrypt OAuth tokens)
     - Checks if token expired → Refresh if needed
     - Determines sync type:
       - FULL: First sync or >7 days since last
       - INCREMENTAL: Last sync <7 days ago (uses watermark)

3. **System fetches QuickBooks data**
   - **API Calls:**
     - `GET /v3/company/{realmId}/query?query=SELECT * FROM Invoice WHERE MetaData.LastUpdatedTime > '{watermark}'`
     - `GET /v3/company/{realmId}/query?query=SELECT * FROM Bill WHERE ...`
     - `GET /v3/company/{realmId}/query?query=SELECT * FROM JournalEntry WHERE ...`
   - **Rate Limiting:** Respects QuickBooks 500 req/minute limit
   - **Pagination:** Fetches all pages

4. **System maps QuickBooks entities to events**
   
   **Invoice → REVENUE Event**
   ```json
   {
     "eventType": "REVENUE",
     "amount": invoice.TotalAmt,
     "timestamp": invoice.TxnDate,
     "projectId": lookupProjectByQBCustomer(invoice.CustomerRef),
     "description": `Invoice ${invoice.DocNumber} from ${invoice.CustomerRef.name}`,
     "sourceSystem": "quickbooks",
     "sourceId": invoice.Id,
     "metadata": {
       "invoiceNumber": invoice.DocNumber,
       "dueDate": invoice.DueDate,
       "customerName": invoice.CustomerRef.name
     }
   }
   ```

   **Bill → MATERIAL_COST Event**
   ```json
   {
     "eventType": "MATERIAL_COST",
     "amount": -bill.TotalAmt,  // Negative for cost
     "timestamp": bill.TxnDate,
     "projectId": lookupProjectByQBClass(bill.ClassRef),
     "description": `Bill from ${bill.VendorRef.name}`,
     "sourceSystem": "quickbooks",
     "sourceId": bill.Id,
     "metadata": {
       "vendorName": bill.VendorRef.name,
       "billNumber": bill.DocNumber
     }
   }
   ```

5. **System handles deduplication**
   - **Idempotency Check:**
     - Query: `SELECT id FROM FinancialEvent WHERE organizationId = ? AND sourceSystem = 'quickbooks' AND sourceId = ?`
     - If exists: Skip (already synced)
     - If not: Insert new event

6. **System processes unmapped entities**
   - **Problem:** Invoice customer "Acme Corp" not mapped to any IntelliSpense Project
   - **System:**
     - Creates pending mapping: `INSERT INTO PendingMapping (sourceEntity, targetEntity, status)`
     - Logs warning in SyncLog: "3 invoices unmapped—customers not linked to projects"
     - Sends notification to user: "⚠️ QuickBooks sync: 3 transactions need project mapping"

7. **System completes sync**
   - **System:**
     - Updates SyncLog:
       - `completedAt` = NOW()
       - `status` = SUCCESS (or PARTIAL_SUCCESS if mappings needed)
       - `recordsSynced` = 47
       - `recordsFailed` = 3
     - Updates Integration `lastSyncAt`
     - Triggers profitability recalculation for affected projects (async)
     - Sends notification: "✓ QuickBooks synced: 47 transactions processed"

**Success Criteria:**
- ✓ All QuickBooks transactions since watermark synced
- ✓ Deduplication prevents double-entry
- ✓ Unmapped entities flagged for user review
- ✓ Profitability updates reflect new data

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| OAuth token expired | Refresh token invalid | Update Integration status = error, notify user to reconnect, retry sync after reconnect |
| QuickBooks API error (500) | QB server issue | Retry with exponential backoff (1s, 2s, 4s, 8s), max 5 attempts, log failure |
| Rate limit exceeded | >500 req/min | Pause sync, wait 60s, resume |
| Mapping ambiguous | Multiple projects match customer | Create pending manual mapping, skip transaction, notify user |
| Network timeout | Poor connectivity | Retry, if fails mark sync incomplete, resume from watermark next cycle |

---

### W006 - Time Tracking Integration (Toggl)

**User Goal:** Convert time entries to labor cost events

**User Personas:** PM (viewing), Accountant (reviewing)

**Trigger:** Scheduled sync (every 15 minutes)

**Preconditions:**
- Toggl integration connected
- Employees mapped to Toggl users
- Projects mapped between systems

**Performance Requirement:** Incremental sync <15 seconds

---

**Flow:**

1. **Sync triggered (every 15 min)**
   - **System (Worker):**
     - Creates SyncLog
     - Fetches time entries: `GET /api/v9/me/time_entries?start_date={watermark}`

2. **System maps time entries to labor costs**
   
   **Toggl Time Entry:**
   ```json
   {
     "id": 12345,
     "user_id": 789,
     "project_id": 456,
     "duration": 7200,  // 2 hours in seconds
     "start": "2026-02-03T10:00:00Z",
     "description": "Foundation inspection"
   }
   ```

   **Mapped to FinancialEvent:**
   ```json
   {
     "eventType": "LABOR_COST",
     "amount": -150.00,  // 2 hours × $75/hr (employee hourly rate)
     "timestamp": "2026-02-03T10:00:00Z",
     "projectId": mapTogglProjectToIntelliSpense(456),
     "employeeId": mapTogglUserToEmployee(789),
     "description": "Foundation inspection (2.0 hrs)",
     "sourceSystem": "toggl",
     "sourceId": "12345",
     "metadata": {
       "hours": 2.0,
       "hourlyRate": 75.00,
       "togglDescription": "Foundation inspection"
     }
   }
   ```

3. **System handles overtime**
   - **If hours exceed 8 in a day:**
     - Query: Count hours for employee on that date
     - If total >8 hours: Apply overtime rate (1.5x)
     - Create separate event for overtime hours
   
   **Example: 10 hours worked**
   - Event 1: 8 hours × $75 = $600 (regular)
   - Event 2: 2 hours × $112.50 = $225 (overtime)

4. **System detects unlogged time**
   - **AI Analysis:**
     - Detects: Employee X has only 4 hours logged on workday
     - Sends notification: "⚠️ John logged only 4 hours on Feb 3. Follow up?"

**Success Criteria:**
- ✓ Time entries synced within 15 minutes
- ✓ Labor costs accurately calculated with rates
- ✓ Overtime handled correctly
- ✓ Profitability reflects latest labor costs

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| Employee not mapped | Toggl user not linked to Employee | Create pending mapping, skip entry, notify user |
| No hourly rate set | Employee.hourlyRate = NULL | Use organization default or flag for manual entry |
| Negative hours | Data error from Toggl | Skip entry, log error, notify support |

---

## Intelligence Workflows

### W007 - Predictive Margin Forecasting

**User Goal:** Know projected final profitability before project completes

**User Personas:** PM, Owner, Executive

**Trigger:** User clicks "Forecast" button or auto-shown in project detail

**Preconditions:**
- Project in ACTIVE status
- At least 20% progress (enough historical data)

**Performance Requirement:** Forecast generated in <8 seconds

---

**Flow:**

1. **User views project detail**
   - **System:** Displays current profitability (actual to-date)
   - **UI:** Shows "Projected Final Margin" card with "Update Forecast" button

2. **System generates forecast (auto or on-demand)**
   - **System (Backend):**
     - Queries project data:
       - Historical burn rate (costs per day/week)
       - Remaining tasks and estimates
       - Budget vs actual trending
       - Similar completed projects (for comparison)
     - Constructs AI prompt:
       ```
       Project: Alpha Construction
       Budget: $100,000
       Spent to date: $45,000 (45%)
       Estimated completion: 60%
       Remaining tasks: 10 (est. 200 hours)
       Historical burn: $2,000/day avg
       Days remaining: ~25 (estimated)
       
       Similar projects:
       - Project Beta: Finished 8% under budget
       - Project Delta: Finished 15% over budget (weather delays)
       
       Forecast final margin with confidence interval.
       ```
     - Calls Claude API
     - Receives structured forecast

   - **AI Output:**
     ```json
     {
       "projectedFinalMargin": -5000,
       "projectedFinalMarginPercentage": -5.0,
       "confidence": 0.78,
       "confidenceInterval": {
         "low": -12000,
         "high": 2000
       },
       "reasoning": "Project trending 5% over budget. Current burn rate $2k/day with 25 days remaining suggests $50k additional costs. Labor hours tracking higher than estimate (10% over). Weather delays possible (outdoor work). Recommend client discussion for scope/budget adjustment.",
       "riskFactors": [
         {"factor": "Labor overrun", "impact": "HIGH", "likelihood": "MEDIUM"},
         {"factor": "Weather delays", "impact": "MEDIUM", "likelihood": "LOW"}
       ],
       "recommendations": [
         {"action": "Reduce crew size by 1", "impact": "Save $3k", "tradeoff": "Add 5 days to schedule"},
         {"action": "Bill client for scope change", "impact": "Add $8k revenue", "tradeoff": "Client approval needed"}
       ]
     }
     ```

3. **System displays forecast**
   - **UI:**
     - **Headline:** "Projected Final Margin: -$5,000 (-5%)" ⚠️
     - **Confidence:** "78% confidence (could range from -$12k to +$2k)"
     - **Chart:** Actual vs Projected trajectory over time
     - **Risk Factors:** Expandable list with severity icons
     - **Recommendations:** Action cards with "Simulate" buttons

4. **User simulates what-if scenarios**
   - **User:** Clicks "Simulate" on "Reduce crew size" recommendation
   - **System:**
     - Recalculates forecast with adjusted parameters
     - Shows comparison: Current forecast vs Scenario forecast
     - Updates chart with scenario line
   - **UI:** Side-by-side comparison table

5. **System creates forecast events (optional)**
   - **User:** Can choose to "Lock in forecast" (creates FORECAST events)
   - **System:** Creates FinancialEvent with eventType = FORECAST
   - **Purpose:** Track forecast accuracy over time, improve AI

**Success Criteria:**
- ✓ Forecast generated within 8 seconds
- ✓ Confidence interval provided (not just point estimate)
- ✓ Reasoning explains key factors
- ✓ Actionable recommendations with tradeoffs
- ✓ What-if scenarios enable decision-making

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| Insufficient data | Project <20% complete | Show message: "Not enough data for reliable forecast. Check back at 20% completion." |
| AI timeout | Claude API slow | Show cached forecast (if exists) with "Updating..." or fallback to simple linear extrapolation |
| Confidence too low (<0.5) | High uncertainty | Show forecast with warning: "⚠️ Low confidence due to limited historical data or high variability" |

---

### W008 - AI Explanation: "Why Did Margin Change?"

**User Goal:** Understand what caused profitability to improve or decline

**User Personas:** PM, Owner, Executive, Accountant

**Trigger:** User clicks "Why?" or "Explain" button on margin metric

**Preconditions:**
- Project has margin history (at least 2 data points)

**Performance Requirement:** Explanation in <5 seconds

---

**Flow:**

1. **User clicks "Why did margin change?"**
   - **Context:** Margin dropped from 15% to 8% over past week

2. **System analyzes margin change**
   - **System (Backend):**
     - Queries events in time window (past 7 days)
     - Calculates margin at start vs end
     - Identifies largest cost increases or revenue decreases
     - Performs semantic search in Pinecone for similar historical patterns
     - Constructs prompt:
       ```
       Project Alpha margin changed: 15% → 8% (dropped 7 points)
       
       Events in past 7 days:
       - Labor costs increased from $5k to $9k (+$4k, +80%)
       - Material costs unchanged
       - Revenue unchanged
       
       Labor cost breakdown:
       - Overtime hours: 40 hrs @ $112.50 = $4,500 (new this week)
       - Regular hours: similar to prior weeks
       
       Explain margin drop in 2-3 sentences for project manager.
       ```
     - Calls Claude API (Sonnet for speed)

   - **AI Response:**
     ```json
     {
       "explanation": "Margin dropped 7 percentage points primarily due to a labor cost surge. The crew worked 40 hours of overtime this week (costing $4.5k extra), likely to meet the Friday foundation pour deadline. This single overtime expense represents 80% of normal weekly labor costs.",
       "primaryCause": "Overtime labor costs",
       "contributingFactors": [
         {"factor": "40 hrs overtime", "impact": "$4,500", "percentage": "64% of margin drop"}
       ],
       "sourceEvents": [
         {"id": "uuid-123", "type": "LABOR_COST", "amount": -4500, "description": "Overtime: Foundation crew"},
         {"id": "uuid-124", "type": "LABOR_COST", "amount": -2000, "description": "Regular hours"}
       ],
       "recommendation": "If overtime pattern continues, project will exceed budget by $8k. Consider: (1) Negotiate timeline extension to reduce OT, or (2) Bill client for expedited schedule."
     }
     ```

3. **System displays explanation**
   - **UI Panel:**
     - **Headline:** "Margin dropped due to overtime surge"
     - **Explanation:** Natural language paragraph (AI response)
     - **Visual:** Donut chart showing cost breakdown
     - **Source Events:** Clickable list of events that caused change
     - **Recommendation:** Action box with next steps

4. **User drills into source events**
   - **User:** Clicks on high-impact event
   - **System:** Highlights event in timeline, shows full details

5. **User asks follow-up (optional)**
   - **User:** Types in chat: "Is this overtime justified?"
   - **System:** Copilot conversation (see W009)

**Success Criteria:**
- ✓ Explanation generated within 5 seconds
- ✓ Answer cites specific events (not generic)
- ✓ Language appropriate for user role (PM vs Accountant)
- ✓ Actionable recommendation included

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| No margin change | Requested explanation but margin stable | Show: "Margin stable at X%. No significant changes detected in past week." |
| Too many factors | 20+ events contributed equally | Group into categories: "Margin decreased due to multiple factors: Labor costs +15%, Material costs +10%, Equipment rentals +8%..." |
| AI hallucination | Claude invents non-existent events | Validate all cited eventIds exist; if not, regenerate without hallucinated data |

---

## Multi-Platform Workflows

### W009 - Offline Event Creation with Sync

**User Goal:** Record costs in the field without internet, sync later

**User Personas:** PM, Foreman, Field Worker

**Trigger:** User at construction site/remote location with no connectivity

**Preconditions:**
- Desktop or mobile app with local SQLite
- User previously synced (has offline dataset)

**Performance Requirement:** Event creation instant (<100ms), sync <30s when online

---

**Flow: Offline**

1. **User opens app (no internet)**
   - **System:** Detects no network connection
   - **System:** Shows "Offline" indicator in UI
   - **System:** All reads work normally from SQLite

2. **User creates event**
   - **User:** Fills event form (Material Cost: $500, "Rebar delivery")
   - **User:** Clicks "Save"
   - **System (Local):**
     - Validates data locally (Zod schema)
     - Generates temporary UUID for event
     - Inserts into local SQLite:
       - `INSERT INTO FinancialEvent (..., _pendingOp = 'create', _syncStatus = 'pending')`
     - Adds to pending sync queue:
       - `INSERT INTO SyncQueue (operation = 'create', tableName = 'FinancialEvent', recordId = uuid)`
   - **UI:**
     - Shows event in timeline immediately (optimistic)
     - Badge: "Pending sync" on event
     - Sync queue counter: "3 changes pending"

3. **User creates more events offline**
   - Events accumulate in local database
   - Sync queue grows
   - Profitability calculated locally (may diverge from server if others made changes)

**Flow: Back Online**

4. **Device reconnects to internet**
   - **System:** Detects connectivity
   - **System:** Shows "Syncing..." indicator
   - **System (Background):**
     - Reads SyncQueue table (3 pending operations)
     - Calls `/api/sync/push` with batch of changes
       ```json
       {
         "operations": [
           {"op": "create", "table": "FinancialEvent", "data": {...}},
           {"op": "create", "table": "FinancialEvent", "data": {...}},
           {"op": "create", "table": "FinancialEvent", "data": {...}}
         ],
         "clientTimestamp": "2026-02-03T14:30:00Z",
         "lastSyncTimestamp": "2026-02-03T09:00:00Z"
       }
       ```

5. **Server processes sync**
   - **System (Backend):**
     - Validates each operation (auth, schema)
     - Checks for conflicts:
       - If same event exists (by sourceSystem+sourceId): Skip (idempotent)
       - If project was deleted: Reject with error
       - If no conflicts: Insert events
     - Returns sync response:
       ```json
       {
         "success": true,
         "recordsApplied": 3,
         "recordsRejected": 0,
         "serverChanges": [...],  // Changes from other users since lastSync
         "newSyncTimestamp": "2026-02-03T14:30:15Z"
       }
       ```

6. **Client applies server changes**
   - **System (Local):**
     - Marks synced events: `UPDATE FinancialEvent SET _syncStatus = 'synced' WHERE _pendingOp = 'create'`
     - Applies server changes (events from other users)
     - Recalculates profitability with merged data
     - Updates UI: Removes "Pending sync" badges

7. **User sees confirmed state**
   - **UI:** Events now show as synced
   - **UI:** Profitability matches server (may have changed if others added costs)
   - **UI:** Success notification: "✓ 3 changes synced"

**Conflict Resolution:**

**Scenario: Two users edit same project offline**
- User A offline: Adds $500 cost
- User B offline: Adds $300 cost
- Both sync when online

**Resolution:**
- Both events inserted (append-only, no conflict)
- Profitability reflects both costs ($800 total)
- No conflict because events are immutable additions

**Edge Case: User deletes project offline, another adds cost**
- Not supported: Projects cannot be deleted, only status changed
- Status changes handled with last-write-wins (timestamp comparison)

**Success Criteria:**
- ✓ Full offline functionality (create, read, calculate)
- ✓ Pending changes clearly marked
- ✓ Automatic sync when connection restored
- ✓ Conflicts resolved without data loss
- ✓ User awareness of sync status

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| Sync conflict | Server rejects event (project deleted) | Mark event failed, notify user, offer resolution (assign to different project or delete) |
| Sync timeout | Large batch, slow network | Split into smaller batches, retry |
| Partial sync | Some events succeed, others fail | Update sync queue to only retry failed, show which events pending |
| Storage full | SQLite database too large | Prompt user to archive old data or free space |

---

### W010 - Cross-Device Continuity

**User Goal:** Start task on desktop, continue on mobile seamlessly

**User Personas:** All

**Trigger:** User switches devices mid-task

**Preconditions:**
- User logged in on multiple devices
- Devices synced within past hour

**Performance Requirement:** State synchronized within 30 seconds

---

**Flow:**

1. **User on desktop: Reviewing Project Alpha**
   - **Current state:**
     - Viewing: /projects/alpha
     - Filtered events: Material costs only
     - Explanation panel open: "Why did margin drop?"

2. **User picks up mobile phone**
   - **System (Mobile):**
     - Background sync runs (pulls latest from server)
     - Fetches user's last active view (stored in server session)
   
   - **System (Server):**
     - Tracks LastActiveView per user:
       ```json
       {
         "userId": "uuid-user",
         "lastView": {
           "platform": "desktop",
           "path": "/projects/alpha",
           "filters": {"eventType": "MATERIAL_COST"},
           "panels": ["explanation"],
           "timestamp": "2026-02-03T15:45:00Z"
         }
       }
       ```

3. **Mobile app restores context (optional)**
   - **UI:** Shows notification: "Continue where you left off? [View Project Alpha]"
   - **User:** Taps notification
   - **System:** Navigates to /projects/alpha with same filters
   - **System:** Opens explanation panel (if mobile screen size allows)

4. **User makes change on mobile**
   - **User:** Creates new event (labor cost)
   - **System:** Syncs immediately via WebSocket (if online)

5. **Desktop receives real-time update**
   - **System (Desktop):**
     - WebSocket receives new event
     - Updates project profitability
     - Shows toast notification: "New labor cost added"
     - Event appears in timeline

**Success Criteria:**
- ✓ Context restored across devices
- ✓ Changes sync in real-time (<5s)
- ✓ Optional continuity (user can choose to start fresh)
- ✓ No data loss between devices

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| Devices out of sync | One device offline for hours | Show: "Last synced 3 hours ago. [Sync Now]", resolve on next sync |
| Context incompatible | Desktop feature not on mobile | Adapt: Restore project view but skip desktop-only panels |

---

## Administrative Workflows

### W011 - Organization Setup & First Project

**User Goal:** Get started with IntelliSpense from zero

**User Personas:** New Owner/Admin

**Trigger:** User signs up, first login

**Preconditions:** None (brand new account)

**Performance Requirement:** Complete onboarding in <10 minutes

---

**Flow:**

1. **User signs up**
   - **System:** Creates User account
   - **System:** Creates Organization (name: from email domain or prompt)
   - **System:** Creates OrganizationMembership (role: OWNER)
   - **System:** Redirects to onboarding wizard

2. **Onboarding: Step 1 - Organization Profile**
   - **System:** Prompts for:
     - Organization name
     - Industry (dropdown)
     - Size (employee count)
     - Currency (default USD)
     - Timezone
   - **User:** Fills form, clicks Next

3. **Onboarding: Step 2 - Create First Project**
   - **System:** Explains: "Projects organize all your costs and revenue. Create your first project to get started."
   - **User:** Fills:
     - Project name (e.g., "Johnson Kitchen Remodel")
     - Budget: $50,000
     - Start date: Today
     - End date: +3 months
   - **System:** Creates Project

4. **Onboarding: Step 3 - Connect Accounting (optional)**
   - **System:** Shows integration cards:
     - QuickBooks [Connect]
     - Xero [Connect]
     - Skip for now
   - **User:** Clicks [Connect QuickBooks]
   - **System:** OAuth flow (see W005), returns to onboarding after
   - **System:** Initiates first sync in background

5. **Onboarding: Step 4 - Invite Team (optional)**
   - **System:** Prompt: "Invite team members to collaborate"
   - **User:** Enters emails and roles
   - **System:** Sends invite emails

6. **Onboarding: Complete**
   - **System:** Shows success screen:
     - ✓ Organization set up
     - ✓ First project created
     - ✓ QuickBooks syncing (47 transactions found)
     - ✓ Team invited
   - **System:** Redirects to /dashboard
   - **UI:** Dashboard shows first project with synced data

7. **Ongoing guidance**
   - **System:** Shows contextual tips:
     - "💡 Add your first manual cost to see profitability calculations"
     - "💡 Install mobile app to record costs in the field"
     - "💡 Ask the AI Copilot any questions about your profitability"

**Success Criteria:**
- ✓ User completes setup in <10 minutes
- ✓ First project created and visible
- ✓ Integration connected (if chosen)
- ✓ User sees immediate value (synced transactions or first manual event)

**Error Paths:**

| Error | Cause | Recovery |
|-------|-------|----------|
| OAuth fails | QuickBooks connection error | Allow skip, retry later from settings |
| Email invite fails | Invalid email | Show inline error, allow fix |

---

## Performance Monitoring

All workflows include performance requirements. System monitors:

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Dashboard load | <2s p95 | >3s |
| Event creation | <500ms p95 | >1s |
| AI explanation | <5s p95 | >8s |
| Sync (1000 events) | <30s p95 | >60s |
| WebSocket latency | <1s p95 | >3s |

---

## Testing Strategy

Each workflow has corresponding test types:

- **Unit tests:** Business logic (profitability calculation, event validation)
- **Integration tests:** API endpoints, database operations
- **E2E tests:** Full user flows (Playwright for web, Detox for mobile)
- **Performance tests:** Load testing (k6) for all workflows
- **Chaos tests:** Network failures, sync conflicts, offline scenarios

---

## Governance

**Updating Workflows:**
1. Propose changes via RFC with rationale
2. Update this document
3. Update affected test cases
4. Update UI/UX designs if visual changes
5. Implement with feature flag (test in staging)
6. Document in release notes

**Workflow Versioning:**
- Workflows evolve over time (never static)
- Breaking changes require migration path for users
- All changes logged in git history

---

**Last Review:** 2026-02-03  
**Next Review:** 2026-03-03 (monthly during Phase 1)
