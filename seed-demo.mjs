// Demo seed script — node seed-demo.mjs
// Creates a realistic warehouse/logistics project with rich data across all modules
const BASE = 'http://localhost:3004'
const TOKEN_CACHE = {}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@local', password: 'Super1!admin' }),
  })
  const d = await r.json()
  TOKEN_CACHE.token = d.token
  return d.token
}

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN_CACHE.token}`, 'X-Project-Id': '1' },
    body: JSON.stringify(body),
  })
  if (!r.ok) { const t = await r.text(); console.error(`POST ${path} → ${r.status}: ${t}`); return null }
  return r.json()
}
async function put(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN_CACHE.token}`, 'X-Project-Id': '1' },
    body: JSON.stringify(body),
  })
  if (!r.ok) { const t = await r.text(); console.error(`PUT ${path} → ${r.status}: ${t}`); return null }
  return r.json()
}

await login()
console.log('✓ Logged in as superadmin')

// ═══════════════════════════════════════════════════════════════
// 1. PEOPLE
// ═══════════════════════════════════════════════════════════════
const people = []
const peopleData = [
  { name: 'Petra Nováková',   email: 'petra.novakova@company.com',   department: 'Operations' },
  { name: 'Jan Dvořák',       email: 'jan.dvorak@company.com',       department: 'Facility' },
  { name: 'Tomáš Blaha',      email: 'tomas.blaha@company.com',      department: 'IT' },
  { name: 'Lucie Marková',    email: 'lucie.markova@company.com',    department: 'Safety' },
  { name: 'Martin Pospíšil',  email: 'martin.pospisil@company.com',  department: 'Automation' },
  { name: 'Eva Horáčková',    email: 'eva.horackova@company.com',    department: 'Procurement' },
  { name: 'Filip Krejčí',     email: 'filip.krejci@company.com',     department: 'IT' },
]
for (const p of peopleData) { const r = await post('/api/people', p); if (r) people.push(r) }
console.log(`✓ People: ${people.length} created`)
const [petra, jan, tomas, lucie, martin, eva, filip] = people

// ═══════════════════════════════════════════════════════════════
// 2. CATEGORIES & PRIORITIES
// ═══════════════════════════════════════════════════════════════
const cats = []
const catsData = [
  { name: 'Fulfillment Equipment', subcategories: ['Sortation', 'Packing', 'Scanning', 'Labeling', 'Training'] },
  { name: 'Automation',            subcategories: ['Robots', 'Conveyor', 'AGV', 'WMS'] },
  { name: 'Facility',              subcategories: ['HVAC', 'Electrical', 'Safety', 'Racking', 'Docking'] },
  { name: 'IT Infrastructure',     subcategories: ['Hardware', 'Software', 'Network', 'Security'] },
  { name: 'Safety & Compliance',   subcategories: ['Fire Safety', 'OHS', 'Training', 'PPE'] },
]
for (const c of catsData) { const r = await post('/api/categories', c); if (r) cats.push(r) }
console.log(`✓ Categories: ${cats.length}`)

const prios = []
const priosData = [
  { name: 'Critical', color: '#D40511', rank: 1 },
  { name: 'High',     color: '#FF6B00', rank: 2 },
  { name: 'Medium',   color: '#FFCC00', rank: 3 },
  { name: 'Low',      color: '#22c55e', rank: 4 },
]
for (const p of priosData) { const r = await post('/api/priorities', p); if (r) prios.push(r) }
console.log(`✓ Priorities: ${prios.length}`)
const [critical, high, medium, low] = prios

await put('/api/settings/eurRate', { value: '25.30' })
console.log('✓ EUR rate: 25.30 CZK')

// ═══════════════════════════════════════════════════════════════
// 3. BUDGET ITEMS (21 items with realistic data)
// ═══════════════════════════════════════════════════════════════
const itemsData = [
  { description: 'WMS System (SAP EWM)', category: 'Automation', subcategory: 'WMS', itemType: 'CAPEX', unit: 'licence', quantity: 1, totalEstCost: 2800000, actualPrice: 2650000, depreciationMonths: 60, tenderStatus: 'Implementation', tenderStartDate: '2025-09-01', tenderDeadline: '2025-12-15', orderPlaceDate: '2026-01-10', deliveryDate: '2026-06-01', responsibleId: tomas.id, priorityId: critical.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'SAP SE', bottleneck: 'Data migration from legacy WMS', notes: 'Critical system — must be live before peak season 2026' },
  { description: 'Warehouse Robots (AMR fleet)', category: 'Automation', subcategory: 'Robots', itemType: 'CAPEX', unit: 'ks', quantity: 12, totalEstCost: 4500000, actualPrice: null, depreciationMonths: 60, tenderStatus: 'Tender Closed', tenderStartDate: '2025-10-01', tenderDeadline: '2026-02-28', orderPlaceDate: '2026-03-15', deliveryDate: '2026-07-01', responsibleId: martin.id, priorityId: critical.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'Locus Robotics', notes: '12x AMR for pick-to-cart operations' },
  { description: 'Conveyor System Extension', category: 'Automation', subcategory: 'Conveyor', itemType: 'CAPEX', unit: 'set', quantity: 1, totalEstCost: 3200000, actualPrice: null, depreciationMonths: 120, tenderStatus: 'Tender Planned', tenderStartDate: '2026-03-01', tenderDeadline: '2026-05-31', deliveryDate: '2026-09-30', responsibleId: martin.id, priorityId: high.id, approval: 'Pending', capexNeeded: true },
  { description: 'Fire Tablets (Packing stations)', category: 'Fulfillment Equipment', subcategory: 'Scanning', itemType: 'CAPEX', unit: 'ks', quantity: 40, totalEstCost: 320000, actualPrice: 298000, depreciationMonths: 36, tenderStatus: 'Implementation', tenderStartDate: '2025-11-01', tenderDeadline: '2026-01-31', orderPlaceDate: '2026-02-15', deliveryDate: '2026-03-15', responsibleId: petra.id, priorityId: high.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'Amazon Business' },
  { description: 'Barcode Scanners (Zebra MC9300)', category: 'Fulfillment Equipment', subcategory: 'Scanning', itemType: 'CAPEX', unit: 'ks', quantity: 60, totalEstCost: 540000, actualPrice: 540000, depreciationMonths: 36, tenderStatus: 'Complete', tenderStartDate: '2025-09-01', tenderDeadline: '2025-11-30', orderPlaceDate: '2025-12-10', deliveryDate: '2026-01-20', responsibleId: petra.id, priorityId: medium.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'Zebra Technologies' },
  { description: 'Label Printers (Zebra ZT411)', category: 'Fulfillment Equipment', subcategory: 'Labeling', itemType: 'CAPEX', unit: 'ks', quantity: 15, totalEstCost: 225000, actualPrice: 218000, depreciationMonths: 36, tenderStatus: 'Complete', tenderStartDate: '2025-10-01', tenderDeadline: '2025-12-15', orderPlaceDate: '2026-01-05', deliveryDate: '2026-02-01', responsibleId: petra.id, priorityId: medium.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'Zebra Technologies' },
  { description: 'Sortation System Upgrade', category: 'Fulfillment Equipment', subcategory: 'Sortation', itemType: 'CAPEX', unit: 'set', quantity: 1, totalEstCost: 1800000, actualPrice: null, depreciationMonths: 120, tenderStatus: 'Tender Planned', tenderStartDate: '2026-04-01', tenderDeadline: '2026-06-30', deliveryDate: '2026-10-31', responsibleId: martin.id, priorityId: high.id, approval: 'Pending', capexNeeded: true },
  { description: 'HVAC System Renovation', category: 'Facility', subcategory: 'HVAC', itemType: 'CAPEX', unit: 'set', quantity: 1, totalEstCost: 950000, actualPrice: 920000, depreciationMonths: 240, tenderStatus: 'Implementation', tenderStartDate: '2025-08-01', tenderDeadline: '2025-10-31', orderPlaceDate: '2025-11-15', deliveryDate: '2026-02-28', responsibleId: jan.id, priorityId: medium.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'Daikin CZ' },
  { description: 'Electrical Infrastructure Upgrade', category: 'Facility', subcategory: 'Electrical', itemType: 'CAPEX', unit: 'set', quantity: 1, totalEstCost: 1200000, actualPrice: null, depreciationMonths: 240, tenderStatus: 'Tender Closed', tenderStartDate: '2025-11-01', tenderDeadline: '2026-01-31', orderPlaceDate: '2026-02-20', deliveryDate: '2026-05-31', responsibleId: jan.id, priorityId: critical.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'ABB s.r.o.', bottleneck: 'Transformer delivery lead time 16 weeks' },
  { description: 'Racking System (new zone C)', category: 'Facility', subcategory: 'Racking', itemType: 'CAPEX', unit: 'set', quantity: 1, totalEstCost: 680000, actualPrice: null, depreciationMonths: 120, tenderStatus: 'Tender Planned', tenderStartDate: '2026-02-01', tenderDeadline: '2026-04-30', deliveryDate: '2026-07-31', responsibleId: jan.id, priorityId: medium.id, approval: 'Pending', capexNeeded: true },
  { description: 'Dock Levelers Replacement', category: 'Facility', subcategory: 'Docking', itemType: 'CAPEX', unit: 'ks', quantity: 6, totalEstCost: 420000, actualPrice: 405000, depreciationMonths: 120, tenderStatus: 'Complete', tenderStartDate: '2025-09-15', tenderDeadline: '2025-11-15', orderPlaceDate: '2025-12-01', deliveryDate: '2026-01-31', responsibleId: jan.id, priorityId: low.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'Hormann' },
  { description: 'Network Infrastructure (WiFi 6E)', category: 'IT Infrastructure', subcategory: 'Network', itemType: 'CAPEX', unit: 'set', quantity: 1, totalEstCost: 380000, actualPrice: 375000, depreciationMonths: 60, tenderStatus: 'Complete', tenderStartDate: '2025-08-01', tenderDeadline: '2025-10-15', orderPlaceDate: '2025-10-25', deliveryDate: '2025-12-15', responsibleId: filip.id, priorityId: high.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'Cisco Meraki' },
  { description: 'Server Room Upgrade', category: 'IT Infrastructure', subcategory: 'Hardware', itemType: 'CAPEX', unit: 'set', quantity: 1, totalEstCost: 650000, actualPrice: null, depreciationMonths: 60, tenderStatus: 'Tender Closed', tenderStartDate: '2025-12-01', tenderDeadline: '2026-02-28', orderPlaceDate: '2026-03-10', deliveryDate: '2026-04-30', responsibleId: filip.id, priorityId: high.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'Dell Technologies' },
  { description: 'Cybersecurity Suite (3y licence)', category: 'IT Infrastructure', subcategory: 'Security', itemType: 'Subscription', unit: 'rok', quantity: 3, totalEstCost: 285000, actualPrice: 285000, tenderStatus: 'Complete', tenderStartDate: '2025-09-01', tenderDeadline: '2025-10-31', orderPlaceDate: '2025-11-10', deliveryDate: '2025-11-15', responsibleId: filip.id, priorityId: critical.id, approval: 'Approved', capexNeeded: false, chosenSupplier: 'CrowdStrike' },
  { description: 'Fire Safety System Upgrade', category: 'Safety & Compliance', subcategory: 'Fire Safety', itemType: 'CAPEX', unit: 'set', quantity: 1, totalEstCost: 520000, actualPrice: null, depreciationMonths: 120, tenderStatus: 'Tender Closed', tenderStartDate: '2025-10-01', tenderDeadline: '2026-01-15', orderPlaceDate: '2026-02-01', deliveryDate: '2026-04-30', responsibleId: lucie.id, priorityId: critical.id, approval: 'Approved', capexNeeded: true, chosenSupplier: 'Siemens Building Tech' },
  { description: 'PPE Equipment Refresh', category: 'Safety & Compliance', subcategory: 'PPE', itemType: 'One-off', unit: 'set', quantity: 200, totalEstCost: 180000, actualPrice: 172000, tenderStatus: 'Complete', orderPlaceDate: '2025-12-01', deliveryDate: '2026-01-15', responsibleId: lucie.id, priorityId: medium.id, approval: 'Approved', capexNeeded: false },
  { description: 'OHS Training Program', category: 'Safety & Compliance', subcategory: 'Training', itemType: 'One-off', unit: 'session', quantity: 12, totalEstCost: 96000, actualPrice: 48000, tenderStatus: 'Implementation', responsibleId: lucie.id, priorityId: medium.id, approval: 'Approved', capexNeeded: false, notes: '6 of 12 sessions completed' },
  { description: 'Packing Station Ergonomics', category: 'Fulfillment Equipment', subcategory: 'Packing', itemType: 'CAPEX', unit: 'ks', quantity: 20, totalEstCost: 360000, actualPrice: null, depreciationMonths: 60, tenderStatus: 'Tender Planned', tenderStartDate: '2026-03-15', tenderDeadline: '2026-05-15', deliveryDate: '2026-08-01', responsibleId: petra.id, priorityId: medium.id, approval: 'Pending', capexNeeded: true },
  { description: 'AGV Charging Stations', category: 'Automation', subcategory: 'AGV', itemType: 'CAPEX', unit: 'ks', quantity: 4, totalEstCost: 280000, actualPrice: null, depreciationMonths: 60, tenderStatus: 'Not Tender Needed', responsibleId: martin.id, priorityId: medium.id, approval: 'Not Required', capexNeeded: true, notes: 'Bundled with AMR fleet order' },
  { description: 'WMS Integration Consulting', category: 'IT Infrastructure', subcategory: 'Software', itemType: 'One-off', unit: 'MD', quantity: 120, totalEstCost: 1440000, actualPrice: 480000, tenderStatus: 'Implementation', responsibleId: tomas.id, priorityId: critical.id, approval: 'Approved', capexNeeded: false, chosenSupplier: 'Deloitte CZ', notes: '40 of 120 MDs delivered', bottleneck: 'Key consultant availability in Q2' },
  { description: 'Training Facility Fit-out', category: 'Facility', subcategory: 'Safety', itemType: 'CAPEX', unit: 'set', quantity: 1, totalEstCost: 150000, actualPrice: null, depreciationMonths: 120, tenderStatus: 'Not Tender Needed', responsibleId: jan.id, priorityId: low.id, approval: 'Pending', capexNeeded: true },
]
let itemCount = 0
for (const item of itemsData) { const r = await post('/api/items', item); if (r) itemCount++ }
console.log(`✓ Budget items: ${itemCount}`)

// ═══════════════════════════════════════════════════════════════
// 4. LABOR COSTS (8 roles)
// ═══════════════════════════════════════════════════════════════
const laborData = [
  { role: 'Project Manager', personName: 'Petra Nováková', department: 'Operations', mdRate: 7500, mdDays: 90, spent: 375000, costType: 'Project' },
  { role: 'IT Project Manager', personName: 'Tomáš Blaha', department: 'IT', mdRate: 8000, mdDays: 70, spent: 280000, costType: 'Project' },
  { role: 'Facility Manager', personName: 'Jan Dvořák', department: 'Facility', mdRate: 6500, mdDays: 60, spent: 195000, costType: 'Project' },
  { role: 'Safety Officer', personName: 'Lucie Marková', department: 'Safety', mdRate: 6000, mdDays: 40, spent: 96000, costType: 'Project' },
  { role: 'Automation Engineer', personName: 'Martin Pospíšil', department: 'Automation', mdRate: 8500, mdDays: 80, spent: 170000, costType: 'Project' },
  { role: 'WMS Consultant (External)', personName: 'Deloitte CZ', department: 'IT', mdRate: 12000, mdDays: 120, spent: 480000, costType: 'Project', notes: 'External consultancy — 40/120 MDs delivered' },
  { role: 'Procurement Specialist', personName: 'Eva Horáčková', department: 'Procurement', mdRate: 5500, mdDays: 45, spent: 82500, costType: 'Project' },
  { role: 'Network Engineer', personName: 'Filip Krejčí', department: 'IT', mdRate: 7000, mdDays: 30, spent: 105000, costType: 'Project' },
]
let laborCount = 0
for (const l of laborData) { const r = await post('/api/labor', l); if (r) laborCount++ }
console.log(`✓ Labor roles: ${laborCount}`)

// ═══════════════════════════════════════════════════════════════
// 5. RISKS (8 risks)
// ═══════════════════════════════════════════════════════════════
const risksData = [
  { title: 'WMS migration data loss', description: 'During legacy WMS to SAP EWM migration, critical inventory data may be lost or corrupted', category: 'technical', probability: 3, impact: 5, mitigationPlan: 'Full data backup before migration, parallel run for 2 weeks, rollback plan prepared', contingencyPlan: 'Activate rollback to legacy system within 4 hours', ownerId: tomas.id, status: 'Monitoring', dateIdentified: '2025-10-15', reviewDate: '2026-04-01' },
  { title: 'Robot fleet delivery delay', description: 'Locus Robotics may not deliver all 12 AMR units by July due to chip shortage', category: 'external', probability: 4, impact: 4, mitigationPlan: 'Partial delivery of 8 units in June, remaining 4 in August', contingencyPlan: 'Temporary manual picking process for affected zones', ownerId: martin.id, status: 'Open', dateIdentified: '2025-12-01', reviewDate: '2026-05-01' },
  { title: 'Electrical upgrade overrun', description: 'Transformer lead time may extend to 20 weeks, pushing electrical work past deadline', category: 'schedule', probability: 3, impact: 4, mitigationPlan: 'Order placed early, weekly tracking with ABB', contingencyPlan: 'Temporary generator for robot charging zones', ownerId: jan.id, status: 'Open', dateIdentified: '2026-01-10', reviewDate: '2026-03-15' },
  { title: 'Budget overrun automation', description: 'Conveyor + sortation costs may exceed estimates by 15-20% due to raw material prices', category: 'financial', probability: 3, impact: 3, mitigationPlan: 'Fixed price contract where possible, 10% contingency reserved', contingencyPlan: 'Descope sortation upgrade to Phase 2', ownerId: eva.id, status: 'Open', dateIdentified: '2025-11-20' },
  { title: 'Key consultant unavailability', description: 'Lead Deloitte WMS consultant may be reassigned to another client in Q2 2026', category: 'organizational', probability: 2, impact: 5, mitigationPlan: 'Contractual commitment for named resources, backup consultant identified', contingencyPlan: 'Engage alternative consultancy (Accenture backup contract)', ownerId: tomas.id, status: 'Monitoring', dateIdentified: '2026-01-05', reviewDate: '2026-03-01' },
  { title: 'Fire safety compliance delay', description: 'New fire safety regulations may require additional sprinkler zones', category: 'regulatory', probability: 2, impact: 3, mitigationPlan: 'Pre-consultation with fire department scheduled March 2026', contingencyPlan: 'Emergency procurement of additional sprinkler heads', ownerId: lucie.id, status: 'Open', dateIdentified: '2026-02-01' },
  { title: 'Staff training backlog', description: 'New equipment training may not be completed for all shifts before go-live', category: 'organizational', probability: 3, impact: 3, mitigationPlan: 'Train-the-trainer program, staggered rollout by shift', contingencyPlan: 'Extended parallel run with old equipment', ownerId: petra.id, status: 'Monitoring', dateIdentified: '2026-01-15', reviewDate: '2026-05-01' },
  { title: 'Cybersecurity incident during migration', description: 'Increased attack surface during WMS migration window', category: 'technical', probability: 2, impact: 5, mitigationPlan: 'Enhanced monitoring during migration, penetration test in March', contingencyPlan: 'Incident response plan activated, network segmentation', ownerId: filip.id, status: 'Open', dateIdentified: '2026-02-10' },
]
const risks = []
for (const r of risksData) { const res = await post('/api/risks', r); if (res) risks.push(res) }
console.log(`✓ Risks: ${risks.length}`)

// ═══════════════════════════════════════════════════════════════
// 6. ISSUES (5 issues)
// ═══════════════════════════════════════════════════════════════
const issuesData = [
  { title: 'WiFi dead spots in zone B3', description: 'Barcode scanners losing connectivity in zone B3 near racking', type: 'Defect', severity: 'High', priority: 'High', status: 'In Progress', ownerId: filip.id, dateReported: '2026-02-20', dueDate: '2026-03-15' },
  { title: 'HVAC noise exceeds limits', description: 'New HVAC units produce noise above 65dB in packing area', type: 'Quality', severity: 'Medium', priority: 'Medium', status: 'Open', ownerId: jan.id, dateReported: '2026-02-28' },
  { title: 'Missing API documentation for WMS', description: 'SAP EWM REST API documentation incomplete for custom integration points', type: 'Documentation', severity: 'High', priority: 'Critical', status: 'In Progress', ownerId: tomas.id, dateReported: '2026-01-15', dueDate: '2026-03-31' },
  { title: 'Dock leveler #4 hydraulic leak', description: 'Newly installed dock leveler shows hydraulic fluid leak under load', type: 'Defect', severity: 'Critical', priority: 'Critical', status: 'Open', ownerId: jan.id, dateReported: '2026-02-25', dueDate: '2026-03-05' },
  { title: 'Label printer firmware incompatible', description: 'ZT411 firmware v8.3 incompatible with WMS label templates', type: 'Compatibility', severity: 'Medium', priority: 'High', status: 'Resolved', ownerId: petra.id, dateReported: '2026-02-10', dueDate: '2026-02-28', resolvedDate: '2026-02-26' },
]
let issueCount = 0
for (const i of issuesData) { const r = await post('/api/issues', i); if (r) issueCount++ }
console.log(`✓ Issues: ${issueCount}`)

// ═══════════════════════════════════════════════════════════════
// 7. CHANGE REQUESTS (4)
// ═══════════════════════════════════════════════════════════════
const changesData = [
  { title: 'Add 4 additional AMR robots', description: 'Increase AMR fleet from 12 to 16 based on updated throughput analysis', changeType: 'Scope', businessJustification: 'Throughput analysis shows 12 robots insufficient for peak season volumes', budgetImpact: 1500000, timelineImpact: '+2 weeks delivery', resourceImpact: 'No additional headcount needed', approvalStatus: 'Submitted', requestedById: martin.id },
  { title: 'Descope sortation upgrade to Phase 2', description: 'Move sortation system upgrade to 2027 to manage budget', changeType: 'Scope', businessJustification: 'Budget pressure from conveyor cost increase, sortation not critical for Phase 1', budgetImpact: -1800000, timelineImpact: 'No impact on Phase 1', approvalStatus: 'Approved', requestedById: eva.id, approvedById: petra.id },
  { title: 'Extend WMS consulting by 20 MDs', description: 'Additional consulting days for custom integration development', changeType: 'Budget', businessJustification: 'Custom API integrations more complex than initially estimated', budgetImpact: 240000, timelineImpact: '+1 week', approvalStatus: 'Approved', requestedById: tomas.id, approvedById: petra.id },
  { title: 'Accelerate server room upgrade', description: 'Move server room timeline forward by 4 weeks to support WMS testing', changeType: 'Schedule', businessJustification: 'WMS UAT environment needs production-grade infrastructure', budgetImpact: 35000, timelineImpact: '-4 weeks (earlier)', approvalStatus: 'Implemented', requestedById: filip.id, approvedById: petra.id },
]
let changeCount = 0
for (const c of changesData) { const r = await post('/api/changes', c); if (r) changeCount++ }
console.log(`✓ Change requests: ${changeCount}`)

// ═══════════════════════════════════════════════════════════════
// 8. ASSUMPTIONS (7)
// ═══════════════════════════════════════════════════════════════
const assumptionsData = [
  { title: 'EUR/CZK rate stays below 26.00', description: 'Budget calculated at 25.30, majority of equipment purchased in EUR', category: 'Finance', phase: 'Execution', type: 'Operational', source: 'Treasury forecast', validationMethod: 'Monthly FX rate review', status: 'Active', ownerId: eva.id, validationDate: '2026-06-30', budgetImpact: 800000, timelineImpact: 0, scopeImpact: 'Low', invalidationProbability: 3 },
  { title: 'SAP EWM licence model unchanged', description: 'SAP will not change EWM licensing before go-live', category: 'Technical', phase: 'Design', type: 'Technical', source: 'SAP account manager', validationMethod: 'Written confirmation from SAP', status: 'Validated', ownerId: tomas.id, validationDate: '2026-03-15', budgetImpact: 0, timelineImpact: 0, scopeImpact: 'Low', invalidationProbability: 1 },
  { title: 'Building permit for zone C', description: 'Zone C racking expansion does not require building permit modification', category: 'Legal', phase: 'Design', type: 'Regulatory', source: 'Facility management assumption', validationMethod: 'Consultation with building authority', status: 'Under review', ownerId: jan.id, validationDate: '2026-04-15', budgetImpact: 200000, timelineImpact: 60, scopeImpact: 'High', invalidationProbability: 2 },
  { title: 'Existing floor can support robot weight', description: 'Warehouse floor load capacity sufficient for 12 AMR + cargo', category: 'Technical', phase: 'Execution', type: 'Technical', source: 'Original building specs', validationMethod: 'Structural engineering assessment', status: 'Active', ownerId: martin.id, validationDate: '2026-03-31', budgetImpact: 500000, timelineImpact: 30, scopeImpact: 'High', invalidationProbability: 2 },
  { title: 'Peak season volumes +15% YoY', description: 'Throughput planning assumes 15% volume increase for Q4 2026', category: 'Business', phase: 'Design', type: 'Operational', source: 'Commercial forecast Q4 2025', validationMethod: 'Updated forecast in June 2026', status: 'Active', ownerId: petra.id, validationDate: '2026-06-15', budgetImpact: 0, timelineImpact: 0, scopeImpact: 'Medium', invalidationProbability: 3 },
  { title: 'No regulatory changes for warehouse automation', description: 'Czech regulations for automated warehouse equipment remain stable', category: 'Legal', phase: 'Execution', type: 'Regulatory', source: 'Legal department review', validationMethod: 'Legislative monitoring', status: 'Active', ownerId: lucie.id, validationDate: '2026-08-01', budgetImpact: 300000, timelineImpact: 45, scopeImpact: 'Medium', invalidationProbability: 2 },
  { title: 'Skilled operator availability', description: 'Sufficient qualified operators available for 2-shift operation', category: 'HR', phase: 'Execution', type: 'Organizational', source: 'HR department', validationMethod: 'Recruitment pipeline review monthly', status: 'Active', ownerId: petra.id, validationDate: '2026-05-31', budgetImpact: 150000, timelineImpact: 14, scopeImpact: 'Medium', invalidationProbability: 3 },
]
let assumptionCount = 0
for (const a of assumptionsData) { const r = await post('/api/assumptions', a); if (r) assumptionCount++ }
console.log(`✓ Assumptions: ${assumptionCount}`)

// ═══════════════════════════════════════════════════════════════
// 9. PROJECT PLAN — TASKS (hierarchical: phases → workstreams → tasks)
// ═══════════════════════════════════════════════════════════════
console.log('\n─── Creating Project Plan ───')

// Phase 1: Infrastructure
const ph1 = await post('/api/tasks', { name: 'Phase 1: Infrastructure', type: 'phase', status: 'in_progress', progress: 65, plannedStart: '2025-09-01', plannedEnd: '2026-03-31', estimatedCost: 3500000, sortOrder: 1 })
console.log(`  Phase: ${ph1.name}`)

const ws1a = await post('/api/tasks', { name: 'Electrical & HVAC', type: 'workstream', parentId: ph1.id, status: 'in_progress', progress: 80, plannedStart: '2025-09-01', plannedEnd: '2026-02-28', estimatedCost: 2150000, ownerId: jan.id, sortOrder: 1 })
const t1a1 = await post('/api/tasks', { name: 'Electrical infrastructure upgrade', type: 'task', parentId: ws1a.id, status: 'in_progress', progress: 70, plannedStart: '2025-09-01', plannedEnd: '2026-02-28', estimatedCost: 1200000, ownerId: jan.id, linkedRiskId: risks[2]?.id, sortOrder: 1 })
const t1a2 = await post('/api/tasks', { name: 'HVAC renovation', type: 'task', parentId: ws1a.id, status: 'done', progress: 100, plannedStart: '2025-08-01', plannedEnd: '2026-02-28', estimatedCost: 950000, ownerId: jan.id, sortOrder: 2 })

const ws1b = await post('/api/tasks', { name: 'Network & Security', type: 'workstream', parentId: ph1.id, status: 'done', progress: 100, plannedStart: '2025-08-01', plannedEnd: '2025-12-31', estimatedCost: 665000, ownerId: filip.id, sortOrder: 2 })
const t1b1 = await post('/api/tasks', { name: 'WiFi 6E deployment', type: 'task', parentId: ws1b.id, status: 'done', progress: 100, plannedStart: '2025-08-01', plannedEnd: '2025-12-15', estimatedCost: 380000, ownerId: filip.id, sortOrder: 1 })
const t1b2 = await post('/api/tasks', { name: 'Cybersecurity suite setup', type: 'task', parentId: ws1b.id, status: 'done', progress: 100, plannedStart: '2025-09-01', plannedEnd: '2025-11-30', estimatedCost: 285000, ownerId: filip.id, linkedRiskId: risks[7]?.id, sortOrder: 2 })

const ws1c = await post('/api/tasks', { name: 'Facility Works', type: 'workstream', parentId: ph1.id, status: 'in_progress', progress: 50, plannedStart: '2025-09-15', plannedEnd: '2026-03-31', estimatedCost: 570000, ownerId: jan.id, sortOrder: 3 })
const t1c1 = await post('/api/tasks', { name: 'Dock leveler replacement', type: 'task', parentId: ws1c.id, status: 'done', progress: 100, plannedStart: '2025-09-15', plannedEnd: '2026-01-31', estimatedCost: 420000, ownerId: jan.id, sortOrder: 1 })
const t1c2 = await post('/api/tasks', { name: 'Training facility fit-out', type: 'task', parentId: ws1c.id, status: 'not_started', progress: 0, plannedStart: '2026-02-01', plannedEnd: '2026-03-31', estimatedCost: 150000, ownerId: jan.id, sortOrder: 2 })

const m1 = await post('/api/tasks', { name: 'Infrastructure Ready', type: 'task', parentId: ph1.id, isMilestone: true, status: 'not_started', progress: 0, plannedStart: '2026-03-31', plannedEnd: '2026-03-31', sortOrder: 99 })

// Phase 2: IT Systems
const ph2 = await post('/api/tasks', { name: 'Phase 2: IT Systems', type: 'phase', status: 'in_progress', progress: 35, plannedStart: '2025-10-01', plannedEnd: '2026-07-31', estimatedCost: 5200000, sortOrder: 2 })
console.log(`  Phase: ${ph2.name}`)

const ws2a = await post('/api/tasks', { name: 'WMS Implementation', type: 'workstream', parentId: ph2.id, status: 'in_progress', progress: 40, plannedStart: '2025-10-01', plannedEnd: '2026-06-30', estimatedCost: 4240000, ownerId: tomas.id, sortOrder: 1 })
const t2a1 = await post('/api/tasks', { name: 'WMS requirements & design', type: 'task', parentId: ws2a.id, status: 'done', progress: 100, plannedStart: '2025-10-01', plannedEnd: '2025-12-31', estimatedCost: 500000, ownerId: tomas.id, sortOrder: 1 })
const t2a2 = await post('/api/tasks', { name: 'WMS development & configuration', type: 'task', parentId: ws2a.id, status: 'in_progress', progress: 55, plannedStart: '2026-01-01', plannedEnd: '2026-04-30', estimatedCost: 1800000, ownerId: tomas.id, linkedRiskId: risks[0]?.id, sortOrder: 2 })
const t2a3 = await post('/api/tasks', { name: 'WMS integration testing', type: 'task', parentId: ws2a.id, status: 'not_started', progress: 0, plannedStart: '2026-04-01', plannedEnd: '2026-05-31', estimatedCost: 500000, ownerId: tomas.id, linkedRiskId: risks[4]?.id, sortOrder: 3 })
const t2a4 = await post('/api/tasks', { name: 'WMS UAT & go-live', type: 'task', parentId: ws2a.id, status: 'not_started', progress: 0, plannedStart: '2026-05-15', plannedEnd: '2026-06-30', estimatedCost: 1440000, ownerId: tomas.id, sortOrder: 4 })

const ws2b = await post('/api/tasks', { name: 'Server Infrastructure', type: 'workstream', parentId: ph2.id, status: 'in_progress', progress: 25, plannedStart: '2025-12-01', plannedEnd: '2026-04-30', estimatedCost: 650000, ownerId: filip.id, sortOrder: 2 })
const t2b1 = await post('/api/tasks', { name: 'Server room preparation', type: 'task', parentId: ws2b.id, status: 'done', progress: 100, plannedStart: '2025-12-01', plannedEnd: '2026-01-31', estimatedCost: 150000, ownerId: filip.id, sortOrder: 1 })
const t2b2 = await post('/api/tasks', { name: 'Hardware installation & config', type: 'task', parentId: ws2b.id, status: 'in_progress', progress: 30, plannedStart: '2026-02-01', plannedEnd: '2026-04-30', estimatedCost: 500000, ownerId: filip.id, sortOrder: 2 })

const m2 = await post('/api/tasks', { name: 'WMS Go-Live', type: 'task', parentId: ph2.id, isMilestone: true, status: 'not_started', progress: 0, plannedStart: '2026-06-30', plannedEnd: '2026-06-30', isCriticalPath: true, sortOrder: 99 })

// Phase 3: Automation
const ph3 = await post('/api/tasks', { name: 'Phase 3: Automation', type: 'phase', status: 'in_progress', progress: 15, plannedStart: '2026-01-01', plannedEnd: '2026-09-30', estimatedCost: 6280000, sortOrder: 3 })
console.log(`  Phase: ${ph3.name}`)

const ws3a = await post('/api/tasks', { name: 'Robot Fleet', type: 'workstream', parentId: ph3.id, status: 'in_progress', progress: 20, plannedStart: '2026-01-01', plannedEnd: '2026-08-31', estimatedCost: 4780000, ownerId: martin.id, sortOrder: 1 })
const t3a1 = await post('/api/tasks', { name: 'AMR site survey & planning', type: 'task', parentId: ws3a.id, status: 'done', progress: 100, plannedStart: '2026-01-01', plannedEnd: '2026-02-15', estimatedCost: 200000, ownerId: martin.id, sortOrder: 1 })
const t3a2 = await post('/api/tasks', { name: 'Robot delivery & commissioning', type: 'task', parentId: ws3a.id, status: 'not_started', progress: 0, plannedStart: '2026-03-15', plannedEnd: '2026-07-31', estimatedCost: 4500000, ownerId: martin.id, linkedRiskId: risks[1]?.id, isCriticalPath: true, sortOrder: 2 })
const t3a3 = await post('/api/tasks', { name: 'Robot integration with WMS', type: 'task', parentId: ws3a.id, status: 'not_started', progress: 0, plannedStart: '2026-06-01', plannedEnd: '2026-08-31', estimatedCost: 80000, ownerId: martin.id, isCriticalPath: true, sortOrder: 3 })

const ws3b = await post('/api/tasks', { name: 'Conveyor & Racking', type: 'workstream', parentId: ph3.id, status: 'not_started', progress: 0, plannedStart: '2026-03-01', plannedEnd: '2026-09-30', estimatedCost: 1500000, ownerId: jan.id, sortOrder: 2 })
const t3b1 = await post('/api/tasks', { name: 'Racking system installation (zone C)', type: 'task', parentId: ws3b.id, status: 'not_started', progress: 0, plannedStart: '2026-03-01', plannedEnd: '2026-06-30', estimatedCost: 680000, ownerId: jan.id, sortOrder: 1 })
const t3b2 = await post('/api/tasks', { name: 'Conveyor extension works', type: 'task', parentId: ws3b.id, status: 'not_started', progress: 0, plannedStart: '2026-05-01', plannedEnd: '2026-09-30', estimatedCost: 820000, ownerId: martin.id, sortOrder: 2 })

const m3 = await post('/api/tasks', { name: 'Automation Operational', type: 'task', parentId: ph3.id, isMilestone: true, status: 'not_started', progress: 0, plannedStart: '2026-09-30', plannedEnd: '2026-09-30', isCriticalPath: true, sortOrder: 99 })

// Phase 4: Go-Live & Training
const ph4 = await post('/api/tasks', { name: 'Phase 4: Go-Live & Training', type: 'phase', status: 'not_started', progress: 0, plannedStart: '2026-06-01', plannedEnd: '2026-10-31', estimatedCost: 1200000, sortOrder: 4 })
console.log(`  Phase: ${ph4.name}`)

const ws4a = await post('/api/tasks', { name: 'Training Program', type: 'workstream', parentId: ph4.id, status: 'not_started', progress: 0, plannedStart: '2026-06-01', plannedEnd: '2026-09-30', estimatedCost: 500000, ownerId: petra.id, sortOrder: 1 })
const t4a1 = await post('/api/tasks', { name: 'Develop training materials', type: 'task', parentId: ws4a.id, status: 'not_started', progress: 0, plannedStart: '2026-06-01', plannedEnd: '2026-07-15', estimatedCost: 100000, ownerId: petra.id, sortOrder: 1 })
const t4a2 = await post('/api/tasks', { name: 'Train-the-trainer sessions', type: 'task', parentId: ws4a.id, status: 'not_started', progress: 0, plannedStart: '2026-07-01', plannedEnd: '2026-08-15', estimatedCost: 150000, ownerId: petra.id, linkedRiskId: risks[6]?.id, sortOrder: 2 })
const t4a3 = await post('/api/tasks', { name: 'Operator training (all shifts)', type: 'task', parentId: ws4a.id, status: 'not_started', progress: 0, plannedStart: '2026-08-01', plannedEnd: '2026-09-30', estimatedCost: 250000, ownerId: petra.id, sortOrder: 3 })

const ws4b = await post('/api/tasks', { name: 'Cutover & Hypercare', type: 'workstream', parentId: ph4.id, status: 'not_started', progress: 0, plannedStart: '2026-09-01', plannedEnd: '2026-10-31', estimatedCost: 700000, ownerId: petra.id, sortOrder: 2 })
const t4b1 = await post('/api/tasks', { name: 'Cutover rehearsal', type: 'task', parentId: ws4b.id, status: 'not_started', progress: 0, plannedStart: '2026-09-01', plannedEnd: '2026-09-15', estimatedCost: 200000, ownerId: tomas.id, sortOrder: 1 })
const t4b2 = await post('/api/tasks', { name: 'Go-live weekend', type: 'task', parentId: ws4b.id, status: 'not_started', progress: 0, plannedStart: '2026-09-27', plannedEnd: '2026-09-28', estimatedCost: 100000, ownerId: petra.id, isCriticalPath: true, sortOrder: 2 })
const t4b3 = await post('/api/tasks', { name: 'Hypercare support (4 weeks)', type: 'task', parentId: ws4b.id, status: 'not_started', progress: 0, plannedStart: '2026-09-29', plannedEnd: '2026-10-31', estimatedCost: 400000, ownerId: tomas.id, sortOrder: 3 })

const m4 = await post('/api/tasks', { name: 'Project Complete', type: 'task', parentId: ph4.id, isMilestone: true, status: 'not_started', progress: 0, plannedStart: '2026-10-31', plannedEnd: '2026-10-31', isCriticalPath: true, sortOrder: 99 })

console.log('✓ Project plan tasks created')

// ═══════════════════════════════════════════════════════════════
// 10. TASK DEPENDENCIES
// ═══════════════════════════════════════════════════════════════
const deps = [
  // Electrical must finish before server room hardware
  { predecessorId: t1a1?.id, successorId: t2b2?.id, type: 'FS', lagDays: 0 },
  // WMS design → WMS development
  { predecessorId: t2a1?.id, successorId: t2a2?.id, type: 'FS', lagDays: 0 },
  // WMS development → WMS testing
  { predecessorId: t2a2?.id, successorId: t2a3?.id, type: 'FS', lagDays: 0 },
  // WMS testing → UAT
  { predecessorId: t2a3?.id, successorId: t2a4?.id, type: 'SS', lagDays: 14 },
  // Server hardware → WMS testing (need infra for test env)
  { predecessorId: t2b2?.id, successorId: t2a3?.id, type: 'FS', lagDays: 0 },
  // Robot delivery → Robot integration with WMS
  { predecessorId: t3a2?.id, successorId: t3a3?.id, type: 'SS', lagDays: 30 },
  // WMS UAT → Go-live
  { predecessorId: t2a4?.id, successorId: t4b2?.id, type: 'FS', lagDays: 0 },
  // Robot integration → Go-live
  { predecessorId: t3a3?.id, successorId: t4b2?.id, type: 'FS', lagDays: 0 },
  // Train-the-trainer → Operator training
  { predecessorId: t4a2?.id, successorId: t4a3?.id, type: 'FS', lagDays: 0 },
  // Go-live → Hypercare
  { predecessorId: t4b2?.id, successorId: t4b3?.id, type: 'FS', lagDays: 0 },
]
let depCount = 0
for (const d of deps) {
  if (d.predecessorId && d.successorId) {
    const r = await post('/api/task-dependencies', d)
    if (r) depCount++
  }
}
console.log(`✓ Dependencies: ${depCount}`)

// ═══════════════════════════════════════════════════════════════
// 11. SAVE BASELINES (for schedule variance demo)
// ═══════════════════════════════════════════════════════════════
await post('/api/tasks/save-all-baselines', {})
console.log('✓ Baselines saved for all tasks')

// Now shift some planned dates to create variance
if (t3a2) await put(`/api/tasks/${t3a2.id}`, { plannedEnd: '2026-08-15' }) // Robot delivery delayed +15 days
if (t2a2) await put(`/api/tasks/${t2a2.id}`, { plannedEnd: '2026-05-15' }) // WMS dev delayed +15 days
console.log('✓ Schedule variance created (robot delivery +15d, WMS dev +15d)')

// ═══════════════════════════════════════════════════════════════
// 12. TEST DATA (a few test sets)
// ═══════════════════════════════════════════════════════════════
const ts1 = await post('/api/testsets', { name: 'WMS Integration Tests', notes: 'End-to-end WMS integration test suite', dateMin: '2026-04-01', dateMax: '2026-05-31' })
const ts2 = await post('/api/testsets', { name: 'Robot Safety Validation', notes: 'AMR safety and collision avoidance tests', dateMin: '2026-07-01', dateMax: '2026-08-15' })
if (ts1) {
  await post(`/api/testsets/${ts1.id}/testcases`, { name: 'Inbound receipt scan', status: 'PASS', testedBy: 'Tomas Blaha' })
  await post(`/api/testsets/${ts1.id}/testcases`, { name: 'Pick list generation', status: 'PASS', testedBy: 'Tomas Blaha' })
  await post(`/api/testsets/${ts1.id}/testcases`, { name: 'Outbound shipment API', status: 'DEFECT', testedBy: 'Filip Krejci' })
  await post(`/api/testsets/${ts1.id}/testcases`, { name: 'Inventory reconciliation', status: 'Not Started' })
  await post(`/api/testsets/${ts1.id}/testcases`, { name: 'Label print integration', status: 'PASS', testedBy: 'Petra Novakova' })
  await post(`/api/testsets/${ts1.id}/testcases`, { name: 'Return processing flow', status: 'N/A' })
  await post(`/api/testsets/${ts1.id}/testcases`, { name: 'Multi-location transfer', status: 'PASS', testedBy: 'Tomas Blaha' })
  await post(`/api/testsets/${ts1.id}/testcases`, { name: 'Cycle count workflow', status: 'WIP' })
}
if (ts2) {
  await post(`/api/testsets/${ts2.id}/testcases`, { name: 'Emergency stop response time', status: 'PASS', testedBy: 'Martin Pospisil' })
  await post(`/api/testsets/${ts2.id}/testcases`, { name: 'Obstacle detection range', status: 'PASS', testedBy: 'Martin Pospisil' })
  await post(`/api/testsets/${ts2.id}/testcases`, { name: 'Human proximity slowdown', status: 'Not Started' })
  await post(`/api/testsets/${ts2.id}/testcases`, { name: 'Collision avoidance multi-robot', status: 'WIP' })
  await post(`/api/testsets/${ts2.id}/testcases`, { name: 'Battery low auto-dock', status: 'PASS', testedBy: 'Martin Pospisil' })
}
console.log('✓ Test sets & cases created')

console.log('\n════════════════════════════════════════')
console.log('  DEMO DATA COMPLETE')
console.log('  Open http://localhost:3004 to see it')
console.log('════════════════════════════════════════')
