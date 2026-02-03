/**
 * Database Seed Script
 * Populates development database with realistic test data
 * 
 * Run: pnpm db:seed
 */

import { FinancialEvent } from '@prisma/client'
import { db as prisma } from './index'
import * as bcrypt from 'bcryptjs'

// `prisma` is the shared client from `getPrismaClient()` in `index.ts`

async function main() {
  console.log('🌱 Seeding database...')

  // Clean existing data (development only!)
  // Delete in correct order to respect foreign key constraints
  if (process.env.NODE_ENV !== 'production') {
    await prisma.auditLog.deleteMany()
    await prisma.notification.deleteMany()
    await prisma.syncLog.deleteMany()
    await prisma.aIDecision.deleteMany()
    await prisma.projectProfitabilitySnapshot.deleteMany()
    await prisma.financialEvent.deleteMany()
    await prisma.task.deleteMany()
    await prisma.project.deleteMany()
    await prisma.integration.deleteMany()
    await prisma.employee.deleteMany()
    await prisma.costCenter.deleteMany()
    await prisma.client.deleteMany()
    await prisma.organizationMembership.deleteMany()
    await prisma.user.deleteMany()
    await prisma.organization.deleteMany()
    console.log('✅ Cleaned existing data')
  }

  // Group main creation operations in a single transaction to ensure referential integrity
  let org: any, owner: any, pm: any, accountant: any, clientA: any, clientB: any

  // Ensure organization exists (upsert to avoid race conditions / duplicates)
  org = await prisma.organization.upsert({
    where: { slug: 'acme-construction' },
    update: {},
    create: {
      name: 'Acme Construction Inc.',
      slug: 'acme-construction',
      industry: 'CONSTRUCTION',
      size: 'SMALL',
      subscriptionTier: 'PROFESSIONAL',
      subscriptionStatus: 'ACTIVE',
      settings: {
        currency: 'USD',
        fiscalYearStart: 1, // January
        defaultLaborBurdenRate: 0.35,
        profitabilityThresholds: {
          low: 10,
          medium: 20,
          high: 30,
        },
      },
    },
  })

      // Create default users (outside transaction so memberships can reference them)
      const passwordHash = await bcrypt.hash('password123', 12)

      owner = await prisma.user.create({
        data: {
          email: 'owner@acme.com',
          name: 'John Smith',
          passwordHash,
          emailVerified: true,
          authProvider: 'EMAIL',
        },
      })

      pm = await prisma.user.create({
        data: {
          email: 'pm@acme.com',
          name: 'Sarah Johnson',
          passwordHash,
          emailVerified: true,
          authProvider: 'EMAIL',
        },
      })

      accountant = await prisma.user.create({
        data: {
          email: 'accountant@acme.com',
          name: 'Mike Chen',
          passwordHash,
          emailVerified: true,
          authProvider: 'EMAIL',
        },
      })

      console.log(`✅ Created users: ${owner.email}, ${pm.email}, ${accountant.email}`)
      console.log(`   owner.id=${owner.id} pm.id=${pm.id} accountant.id=${accountant.id}`)

  
    console.log(`✅ Created organization: ${org.name}`)
    console.log(`   org.id = ${org.id}`)

    // users created above

    // Create organization memberships (use top-level client to avoid transaction visibility issues)
    await prisma.organizationMembership.create({
      data: {
        organizationId: org.id,
        userId: owner.id,
        role: 'OWNER',
        permissions: ['*'],
      },
    })

    await prisma.organizationMembership.create({
      data: {
        organizationId: org.id,
        userId: pm.id,
        role: 'PROJECT_MANAGER',
        permissions: ['projects:read', 'projects:write', 'events:read'],
      },
    })

    await prisma.organizationMembership.create({
      data: {
        organizationId: org.id,
        userId: accountant.id,
        role: 'ACCOUNTANT',
        permissions: ['projects:read', 'events:read', 'events:write', 'reports:read'],
      },
    })
    console.log('✅ Created organization memberships')

    // Create clients
    clientA = await prisma.client.create({
      data: {
        organizationId: org.id,
        name: 'Downtown Development Corp',
        code: 'DDC',
        industry: 'CONSTRUCTION',
        contactName: 'Emily Rodriguez',
        contactEmail: 'emily@downtowndev.com',
        contactPhone: '+1-555-0100',
        paymentTerms: 'Net 30',
        metadata: {},
      },
    })

    clientB = await prisma.client.create({
      data: {
        organizationId: org.id,
        name: 'City of Springfield',
        code: 'COS',
        industry: 'CONSTRUCTION',
        contactName: 'Robert Williams',
        contactEmail: 'rwilliams@springfield.gov',
        contactPhone: '+1-555-0200',
        paymentTerms: 'Net 45',
        metadata: {},
      },
    })
    console.log(`✅ Created clients: ${clientA.name}, ${clientB.name}`)
  
  // Create employees needed for labor events (create outside tx so they are visible)
  // Re-resolve organization to guarantee FK availability
  const orgRec = await prisma.organization.findUnique({ where: { slug: 'acme-construction' } })
  if (!orgRec) throw new Error('Organization missing')

  const pmEmployee = await prisma.employee.create({
    data: {
      organizationId: orgRec.id,
      userId: pm.id,
      name: 'Sarah Johnson',
      employeeCode: 'EMP001',
      role: 'Project Manager',
      department: 'Management',
      hourlyRate: 65.0,
      hireDate: new Date('2023-01-15'),
      status: 'ACTIVE',
    },
  })

  const foremanEmployee = await prisma.employee.create({
    data: {
      organizationId: orgRec.id,
      name: 'David Martinez',
      employeeCode: 'EMP002',
      role: 'Senior Foreman',
      department: 'Field',
      hourlyRate: 45.0,
      overtimeRate: 67.5,
      hireDate: new Date('2022-06-01'),
      status: 'ACTIVE',
    },
  })

  const carpenterEmployee = await prisma.employee.create({
    data: {
      organizationId: orgRec.id,
      name: 'Lisa Anderson',
      employeeCode: 'EMP003',
      role: 'Carpenter',
      department: 'Field',
      hourlyRate: 30.0,
      overtimeRate: 45.0,
      hireDate: new Date('2021-09-10'),
      status: 'ACTIVE',
    },
  })

  // Create projects and related records
  // Resolve clients again to ensure FK availability
  const clientARec = await prisma.client.findFirst({ where: { code: 'DDC' } })
  const clientBRec = await prisma.client.findFirst({ where: { code: 'COS' } })
  if (!clientARec || !clientBRec) throw new Error('Expected clients to exist before creating projects')

  const project1 = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: 'Downtown Office Renovation',
      code: 'PRJ-2024-001',
      clientId: clientARec.id,
      managerId: pm.id,
      status: 'ACTIVE',
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-06-30'),
      budget: 350000.0,
      description: 'Complete renovation of 5th floor office space including electrical, HVAC, and interior finishes',
    },
  })

    const project2 = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: 'City Hall Repairs',
      code: 'PRJ-2024-002',
      clientId: clientBRec.id,
      managerId: pm.id,
      status: 'ACTIVE',
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-04-15'),
      budget: 125000.0,
      description: 'Roof repairs, window replacements, and exterior painting',
    },
  })

    const project3 = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: 'Residential Addition - Smith Residence',
      code: 'PRJ-2024-003',
      managerId: pm.id,
      status: 'PLANNED',
      startDate: new Date('2024-04-01'),
      endDate: new Date('2024-08-31'),
      budget: 180000.0,
      description: 'Two-story addition with master suite and home office',
    },
  })
  console.log(`✅ Created projects: ${project1.name}, ${project2.name}, ${project3.name}`)
  console.log(`   project1.id=${project1.id} project2.id=${project2.id} project3.id=${project3.id}`)
  try {
    const projs = await prisma.$queryRawUnsafe('SELECT id, name FROM projects')
    console.log('   projects rows:', projs)
  } catch (err) {
    console.error('   projects select failed:', (err as Error).message)
  }

    // Create cost centers used in events
    const officeOverhead = await prisma.costCenter.create({
      data: {
        organizationId: org.id,
        name: 'Office Overhead',
        type: 'OVERHEAD',
        allocationRule: { method: 'REVENUE_BASED', rate: 0.15 },
        isActive: true,
      },
    })

    const equipmentPool = await prisma.costCenter.create({
      data: {
        organizationId: org.id,
        name: 'Equipment Pool',
        type: 'EQUIPMENT',
        allocationRule: { method: 'LABOR_HOURS', dailyRate: 125.0 },
        isActive: true,
      },
    })

  // Create tasks for Project 1
  let task1: any, task2: any
  try {
    console.log(`   creating task1 for project=${project1.id}`)
    const projCheck = await prisma.project.findUnique({ where: { id: project1.id } })
    console.log('   projCheck:', !!projCheck)
    task1 = await prisma.task.create({
    data: {
      projectId: project1.id,
      name: 'Demolition',
      phase: 'Phase 1',
      estimatedHours: 80,
      estimatedCost: 6500.0,
      status: 'COMPLETED',
      sortOrder: 1,
    },
  })

    task2 = await prisma.task.create({
    data: {
      projectId: project1.id,
      name: 'Electrical Rough-In',
      phase: 'Phase 2',
      estimatedHours: 120,
      estimatedCost: 12000.0,
      status: 'IN_PROGRESS',
      sortOrder: 2,
    },
  })

    await prisma.task.create({
    data: {
      projectId: project1.id,
      name: 'Drywall Installation',
      phase: 'Phase 3',
      estimatedHours: 160,
      estimatedCost: 15000.0,
      status: 'NOT_STARTED',
      sortOrder: 3,
    },
  })
    console.log(`✅ Created ${3} tasks for ${project1.name}`)
  } catch (err) {
    console.error('   task create error:', (err as Error).message)
    try {
      const projs = await prisma.$queryRawUnsafe('SELECT id, name FROM projects')
      console.error('   projects rows at task error:', projs)
    } catch (inner) {
      console.error('   projects debug failed:', (inner as Error).message)
    }
    throw err
  }

    // Create financial events for Project 1 (Downtown Office Renovation)
  const baseDate = new Date('2024-01-20')
  
  // Revenue events
    await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      eventType: 'REVENUE',
      timestamp: new Date(baseDate.getTime() + 0 * 24 * 60 * 60 * 1000),
      amount: 87500.0, // 25% down payment
      currency: 'USD',
      projectId: project1.id,
      clientId: clientA.id,
      description: 'Initial deposit - 25% of contract value',
      sourceSystem: 'QUICKBOOKS',
      sourceId: 'INV-2024-001',
      createdBy: owner.id,
      metadata: {
        invoiceNumber: 'INV-2024-001',
        paymentMethod: 'ACH',
      },
    },
  })

    await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      eventType: 'REVENUE',
      timestamp: new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000),
      amount: 87500.0, // Progress payment
      currency: 'USD',
      projectId: project1.id,
      clientId: clientA.id,
      description: 'Progress payment - Month 1',
      sourceSystem: 'QUICKBOOKS',
      sourceId: 'INV-2024-015',
      createdBy: owner.id,
      metadata: {
        invoiceNumber: 'INV-2024-015',
        paymentMethod: 'Check',
      },
    },
  })

  // Labor costs (multiple events)
  const laborEvents = [
    { date: 1, employeeId: pmEmployee.id, hours: 20, rate: 65.0, taskId: task1.id },
    { date: 2, employeeId: foremanEmployee.id, hours: 40, rate: 45.0, taskId: task1.id },
    { date: 3, employeeId: carpenterEmployee.id, hours: 40, rate: 35.0, taskId: task1.id },
    { date: 8, employeeId: foremanEmployee.id, hours: 48, rate: 45.0, taskId: task2.id },
    { date: 15, employeeId: pmEmployee.id, hours: 16, rate: 65.0, taskId: task2.id },
  ]

  for (const labor of laborEvents) {
    await prisma.financialEvent.create({
      data: {
        organizationId: org.id,
        eventType: 'LABOR_COST',
        timestamp: new Date(baseDate.getTime() + labor.date * 24 * 60 * 60 * 1000),
        amount: -(labor.hours * labor.rate),
        currency: 'USD',
        projectId: project1.id,
        taskId: labor.taskId,
        employeeId: labor.employeeId,
        description: `Labor: ${labor.hours} hours`,
        sourceSystem: 'TOGGL',
        sourceId: `TIME-${Date.now()}-${labor.date}`,
        createdBy: pm.id,
        metadata: {
          hours: labor.hours,
          rate: labor.rate,
          period: 'Weekly',
        },
      },
    })
  }

  // Material costs
    await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      eventType: 'MATERIAL_COST',
      timestamp: new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000),
      amount: -12500.0,
      currency: 'USD',
      projectId: project1.id,
      taskId: task1.id,
      description: 'Dumpster rental and disposal fees',
      sourceSystem: 'QUICKBOOKS',
      sourceId: 'BILL-2024-045',
      createdBy: accountant.id,
      metadata: {
        vendor: 'Waste Management',
        invoiceNumber: 'WM-789456',
      },
    },
  })

    await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      eventType: 'MATERIAL_COST',
      timestamp: new Date(baseDate.getTime() + 10 * 24 * 60 * 60 * 1000),
      amount: -8750.0,
      currency: 'USD',
      projectId: project1.id,
      taskId: task2.id,
      description: 'Electrical materials - wire, conduit, boxes, panels',
      sourceSystem: 'QUICKBOOKS',
      sourceId: 'BILL-2024-052',
      createdBy: accountant.id,
      metadata: {
        vendor: 'Electrical Supply Co',
        invoiceNumber: 'ESC-123789',
      },
    },
  })

  // Equipment costs
    await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      eventType: 'EQUIPMENT_COST',
      timestamp: new Date(baseDate.getTime() + 1 * 24 * 60 * 60 * 1000),
      amount: -1250.0,
      currency: 'USD',
      projectId: project1.id,
      costCenterId: equipmentPool.id,
      description: 'Scissor lift rental - 2 weeks',
      sourceSystem: 'QUICKBOOKS',
      sourceId: 'BILL-2024-038',
      createdBy: accountant.id,
      metadata: {
        vendor: 'Equipment Rentals Inc',
        rentalPeriod: '2 weeks',
      },
    },
  })

  // Overhead allocation
    await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      eventType: 'OVERHEAD_COST',
      timestamp: new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000),
      amount: -13125.0, // 15% of $87,500 revenue
      currency: 'USD',
      projectId: project1.id,
      costCenterId: officeOverhead.id,
      description: 'Monthly overhead allocation (15% of revenue)',
      sourceSystem: 'INTELLISPENSE',
      sourceId: `OVERHEAD-${project1.id}-2024-01`,
      createdBy: accountant.id,
      metadata: {
        allocationMethod: 'REVENUE_BASED',
        allocationRate: 0.15,
        basedOnRevenue: 87500.0,
      },
    },
  })

  console.log(`✅ Created financial events for ${project1.name}`)

    // Create events for Project 2 (City Hall)
    await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      eventType: 'REVENUE',
      timestamp: new Date('2024-02-05'),
      amount: 62500.0, // 50% upfront (government contract)
      currency: 'USD',
      projectId: project2.id,
      clientId: clientB.id,
      description: 'Contract award - 50% upfront payment',
      sourceSystem: 'QUICKBOOKS',
      sourceId: 'INV-2024-008',
      createdBy: owner.id,
      metadata: {
        contractNumber: 'GOV-2024-0042',
      },
    },
  })

    await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      eventType: 'LABOR_COST',
      timestamp: new Date('2024-02-12'),
      amount: -2800.0, // 40 hours @ $70/hr (specialized work)
      currency: 'USD',
      projectId: project2.id,
      description: 'Roof inspection and repairs',
      sourceSystem: 'TOGGL',
      sourceId: 'TIME-2024-PRJ2-001',
      createdBy: pm.id,
      metadata: {
        hours: 40,
        rate: 70.0,
      },
    },
  })

    await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      eventType: 'MATERIAL_COST',
      timestamp: new Date('2024-02-15'),
      amount: -15000.0,
      currency: 'USD',
      projectId: project2.id,
      description: 'Roofing materials - shingles, underlayment, flashing',
      sourceSystem: 'QUICKBOOKS',
      sourceId: 'BILL-2024-061',
      createdBy: accountant.id,
      metadata: {
        vendor: 'Roofing Supply Warehouse',
      },
    },
  })

    console.log(`✅ Created financial events for ${project2.name}`)

    // Create QuickBooks integration
    await prisma.integration.create({
    data: {
      organizationId: org.id,
      type: 'QUICKBOOKS',
      name: 'QuickBooks Online',
      status: 'CONNECTED',
      credentials: {
        // In production, this would be encrypted
        accessToken: 'encrypted_access_token_placeholder',
        refreshToken: 'encrypted_refresh_token_placeholder',
        realmId: 'qbo_realm_id_placeholder',
      },
      configuration: {
        syncInvoices: true,
        syncBills: true,
        syncTimeEntries: false,
        autoSync: true,
        syncFrequency: 'hourly',
      },
      lastSyncAt: new Date(),
      lastSyncStatus: 'SUCCESS',
      createdBy: owner.id,
    },
  })
    console.log('✅ Created QuickBooks integration')

    // Calculate and create profitability snapshot for Project 1
    const project1Events = await prisma.financialEvent.findMany({
      where: {
        projectId: project1.id,
        validTo: null,
      },
    })

  const totalRevenue = project1Events
    .filter((e: FinancialEvent) => e.eventType === 'REVENUE')
    .reduce((sum: number, e: FinancialEvent) => sum + Number(e.amount), 0)

  const totalLaborCost = Math.abs(
    project1Events
      .filter((e: FinancialEvent) => e.eventType === 'LABOR_COST')
      .reduce((sum: number, e: FinancialEvent) => sum + Number(e.amount), 0)
  )

  const totalMaterialCost = Math.abs(
    project1Events
      .filter((e: FinancialEvent) => e.eventType === 'MATERIAL_COST')
      .reduce((sum: number, e: FinancialEvent) => sum + Number(e.amount), 0)
  )

  const totalEquipmentCost = Math.abs(
    project1Events
      .filter((e: FinancialEvent) => e.eventType === 'EQUIPMENT_COST')
      .reduce((sum: number, e: FinancialEvent) => sum + Number(e.amount), 0)
  )

  const totalOverheadCost = Math.abs(
    project1Events
      .filter((e: FinancialEvent) => e.eventType === 'OVERHEAD_COST')
      .reduce((sum: number, e: FinancialEvent) => sum + Number(e.amount), 0)
  )

  const totalCosts = totalLaborCost + totalMaterialCost + totalEquipmentCost + totalOverheadCost
  const margin = totalRevenue - totalCosts
  const marginPercentage = totalRevenue > 0 ? (margin / totalRevenue) * 100 : null

    await prisma.projectProfitabilitySnapshot.create({
    data: {
      projectId: project1.id,
      asOfDate: new Date(),
      totalRevenue,
      totalLaborCost,
      totalMaterialCost,
      totalOverheadCost,
      totalEquipmentCost,
      totalSubcontractorCost: 0,
      totalCosts,
      margin,
      marginPercentage,
      eventCount: project1Events.length,
    },
  })
  console.log(`✅ Created profitability snapshot for ${project1.name}`)
  console.log(`   Revenue: $${totalRevenue.toFixed(2)}`)
  console.log(`   Costs: $${totalCosts.toFixed(2)}`)
  console.log(`   Margin: $${margin.toFixed(2)} (${marginPercentage?.toFixed(2)}%)`)

  // Create AI decision (example cost attribution)
    await prisma.aIDecision.create({
    data: {
      organizationId: org.id,
      decisionType: 'COST_ATTRIBUTION',
      inputContext: {
        costCenterId: officeOverhead.id,
        amount: 13125.0,
        projects: [project1.id, project2.id],
        allocationMethod: 'REVENUE_BASED',
      },
      output: {
        allocations: [
          { projectId: project1.id, amount: 8750.0, percentage: 66.67 },
          { projectId: project2.id, amount: 4375.0, percentage: 33.33 },
        ],
        reasoning: 'Allocated overhead based on revenue proportion: Project 1 ($175k) vs Project 2 ($62.5k)',
      },
      modelVersion: 'claude-3-sonnet-20240229',
      modelProvider: 'ANTHROPIC',
      promptVersion: 'v1.0',
      latencyMs: 1250,
      tokenCount: 450,
      userReview: 'APPROVED',
    },
  })
    console.log('✅ Created AI decision example')

    // Create notifications
    await prisma.notification.create({
    data: {
      organizationId: org.id,
      type: 'SYNC_COMPLETE',
      priority: 'LOW',
      title: 'QuickBooks sync completed',
      message: 'Successfully synced 15 invoices and 8 bills from QuickBooks Online',
      status: 'READ',
      deliveryChannels: ['IN_APP'],
      deliveredAt: new Date(),
      readAt: new Date(),
    },
  })

    await prisma.notification.create({
    data: {
      organizationId: org.id,
      type: 'MARGIN_ALERT',
      priority: 'MEDIUM',
      title: 'Project margin below target',
      message: `${project1.name}: Current margin is 32.1%, below your 35% target threshold`,
      relatedEntityType: 'Project',
      relatedEntityId: project1.id,
      status: 'UNREAD',
      deliveryChannels: ['IN_APP', 'EMAIL'],
      deliveredAt: new Date(),
    },
  })
  console.log('✅ Created notifications')

  // Create audit log entries
    await prisma.auditLog.createMany({
    data: [
      {
        organizationId: org.id,
        userId: owner.id,
        action: 'USER_LOGIN',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0...',
        result: 'SUCCESS',
      },
      {
        organizationId: org.id,
        userId: accountant.id,
        action: 'FINANCIAL_EVENT_CREATE',
        entityType: 'FinancialEvent',
        changes: {
          eventType: 'MATERIAL_COST',
          amount: -8750.0,
          projectId: project1.id,
        },
        ipAddress: '192.168.1.105',
        result: 'SUCCESS',
      },
      {
        organizationId: org.id,
        userId: pm.id,
        action: 'PROJECT_UPDATE',
        entityType: 'Project',
        entityId: project1.id,
        changes: {
          status: { from: 'PLANNED', to: 'ACTIVE' },
        },
        ipAddress: '192.168.1.102',
        result: 'SUCCESS',
      },
    ],
  })
    console.log('✅ Created audit log entries')

  console.log('\n🎉 Database seeded successfully!')
  console.log('\n📊 Summary:')
  console.log(`   Organizations: 1`)
  console.log(`   Users: 3`)
  console.log(`   Clients: 2`)
  console.log(`   Employees: 4`)
  console.log(`   Projects: 3`)
  console.log(`   Tasks: 3`)
  const totalEvents = await prisma.financialEvent.count({ where: { organizationId: org.id } })
  console.log(`   Financial Events: ${totalEvents}`)
  console.log(`   Cost Centers: 2`)
  console.log(`   Integrations: 1`)
  console.log('\n🔑 Test Credentials:')
  console.log(`   Owner: owner@acme.com / password123`)
  console.log(`   PM: pm@acme.com / password123`)
  console.log(`   Accountant: accountant@acme.com / password123`)
  console.log('\n💡 Next steps:')
  console.log(`   1. Run: pnpm db:studio`)
  console.log(`   2. Browse data at http://localhost:5555`)
  console.log(`   3. Start API: cd apps/api && pnpm dev`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
