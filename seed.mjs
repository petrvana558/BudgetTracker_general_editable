// Seed script — spouštěj: node seed.mjs
const BASE = 'http://localhost:3003'

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}
async function put(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

// ─── People ───────────────────────────────────────────────────
const people = await Promise.all([
  post('/api/people', { name: 'Petra Nováková', email: 'petra.novakova@dhl.com', department: 'Operations' }),
  post('/api/people', { name: 'Jan Dvořák',     email: 'jan.dvorak@dhl.com',     department: 'Facility' }),
  post('/api/people', { name: 'Tomáš Blaha',    email: 'tomas.blaha@dhl.com',    department: 'IT' }),
  post('/api/people', { name: 'Lucie Marková',  email: 'lucie.markova@dhl.com',  department: 'Safety' }),
  post('/api/people', { name: 'Martin Pospíšil',email: 'martin.pospisil@dhl.com',department: 'Automation' }),
])
console.log('✓ People:', people.map(p => p.name).join(', '))

// ─── Categories ───────────────────────────────────────────────
const cats = await Promise.all([
  post('/api/categories', { name: 'Fulfillment Equipment', subcategories: ['Sortation', 'Packing', 'Scanning', 'Labeling', 'Training'] }),
  post('/api/categories', { name: 'Automation',            subcategories: ['Robots', 'Conveyor', 'AGV', 'WMS'] }),
  post('/api/categories', { name: 'Facility',              subcategories: ['HVAC', 'Electrical', 'Safety', 'Racking', 'Docking'] }),
  post('/api/categories', { name: 'IT Infrastructure',     subcategories: ['Hardware', 'Software', 'Network', 'Security'] }),
  post('/api/categories', { name: 'Safety & Compliance',   subcategories: ['Fire Safety', 'OHS', 'Training', 'PPE'] }),
])
console.log('✓ Categories:', cats.map(c => c.name).join(', '))

// ─── Priorities ───────────────────────────────────────────────
const prios = await Promise.all([
  post('/api/priorities', { name: 'Kritická', color: '#D40511', rank: 1 }),
  post('/api/priorities', { name: 'Vysoká',   color: '#FF6B00', rank: 2 }),
  post('/api/priorities', { name: 'Střední',  color: '#FFCC00', rank: 3 }),
  post('/api/priorities', { name: 'Nízká',    color: '#22c55e', rank: 4 }),
])
console.log('✓ Priorities:', prios.map(p => p.name).join(', '))

// EUR kurz
await put('/api/settings/eurRate', { value: '25.00' })
console.log('✓ EUR kurz: 25,00 CZK')

// ─── Items ────────────────────────────────────────────────────
const [petra, jan, tomas, lucie, martin] = people
const [krit, vysoka, stredni, nizka] = prios

const items = [
  {
    description: 'Training cost for time equipment',
    category: 'Fulfillment Equipment', subcategory: 'Training',
    itemType: 'One-off', unit: 'paušál', quantity: 1,
    totalEstCost: 184947, actualPrice: 184947,
    tenderStatus: 'Implementation',
    tenderStartDate: '2025-11-01', tenderDeadline: '2025-12-15',
    orderPlaceDate: '2026-01-10', deliveryDate: '2026-02-15',
    responsibleId: petra.id, priorityId: stredni.id,
    approval: 'Approved', capexNeeded: false,
    notes: 'Školení operátorů na nové vybavení',
  },
  {
    description: 'Testing & Training Equipment (Fire tablet set)',
    category: 'Fulfillment Equipment', subcategory: 'Scanning',
    itemType: 'CAPEX', unit: 'ks', quantity: 40,
    totalEstCost: 320000, actualPrice: null,
    depreciationMonths: 36,
    tenderStatus: 'Tender Planned',
    tenderStartDate: '2026-02-01', tenderDeadline: '2026-03-31',
    orderPlaceDate: null, deliveryDate: '2026-05-15',
    responsibleId: petra.id, priorityId: vysoka.id,
    approval: 'Pending', capexNeeded: true,
    notes: 'Fire tablety pro packery — 40 ks pro 2 směny',
  },
  {
    description: 'Escalation Drives and Training Items',
    category: 'Fulfillment Equipment', subcategory: 'Training',
    itemType: 'One-off', unit: 'paušál', quantity: 1,
    totalEstCost: 50000, actualPrice: null,
    tenderStatus: 'Not Tender Needed',
    responsibleId: petra.id, priorityId: nizka.id,
    approval: 'Not Required', capexNeeded: false,
  },
  {
    description: 'OHS implementation cost',
    category: 'Fulfillment Equipment', subcategory: 'Training',
    itemType: 'One-off', unit: 'paušál', quantity: 1,
    totalEstCost: 75000, actualPrice: 68000,
    tenderStatus: 'Complete',
    tenderDeadline: '2025-10-01',
    orderPlaceDate: '2025-09-15', deliveryDate: '2025-11-30',
    responsibleId: lucie.id, priorityId: stredni.id,
    approval: 'Approved', capexNeeded: false,
  },
  {
    description: 'Tablets for VAS and deep in-site mailing materials',
    category: 'Fulfillment Equipment', subcategory: 'Scanning',
    itemType: 'CAPEX', unit: 'ks', quantity: 20,
    totalEstCost: 240000, actualPrice: null,
    depreciationMonths: 36,
    tenderStatus: 'Tender Planned',
    tenderStartDate: '2026-03-01', tenderDeadline: '2026-04-30',
    deliveryDate: '2026-06-30',
    responsibleId: tomas.id, priorityId: stredni.id,
    approval: 'Pending', capexNeeded: true,
  },
  {
    description: 'WMS transition system (PLC+)',
    category: 'Fulfillment Equipment', subcategory: 'Labeling',
    itemType: 'Subscription', unit: 'rok', quantity: 3,
    totalEstCost: 1200000, additionalCostRevision: 85000, totalCostAfterRevision: 1285000,
    actualPrice: null, depreciationMonths: 60,
    tenderStatus: 'Tender Closed',
    tenderStartDate: '2025-10-01', tenderDeadline: '2026-01-31',
    orderPlaceDate: '2026-02-15', deliveryDate: '2026-07-01',
    responsibleId: tomas.id, priorityId: krit.id,
    approval: 'Approved', capexNeeded: true,
    chosenSupplier: 'SAP SE',
    bottleneck: 'Závislost na migraci dat z legacy systému',
    notes: 'Kritická infrastruktura — nutné dokončit před peak season 2026',
  },
  {
    description: 'Material for training and site preparation',
    category: 'Fulfillment Equipment', subcategory: 'Training',
    itemType: 'One-off', unit: 'paušál', quantity: 1,
    totalEstCost: 38000, actualPrice: 35500,
    tenderStatus: 'Complete',
    responsibleId: petra.id, priorityId: nizka.id,
    approval: 'Approved',
  },
  {
    description: 'Wrapping automatic robot — stretch wrap station',
    category: 'Automation', subcategory: 'Robots',
    itemType: 'CAPEX', unit: 'ks', quantity: 2,
    totalEstCost: 890000, actualPrice: null,
    depreciationMonths: 84,
    tenderStatus: 'Tender Planned',
    tenderStartDate: '2026-01-15', tenderDeadline: '2026-03-15',
    orderPlaceDate: null, deliveryDate: '2026-08-30',
    responsibleId: martin.id, priorityId: vysoka.id,
    approval: 'Pending', capexNeeded: true,
    notes: 'Automatické obalování paletizovaného zboží',
  },
  {
    description: 'Company Robot — floor cleaning AMR',
    category: 'Automation', subcategory: 'AGV',
    itemType: 'Lease', unit: 'ks', quantity: 3,
    totalEstCost: 450000, actualPrice: null,
    depreciationMonths: 60,
    tenderStatus: 'Not Tender Needed',
    orderPlaceDate: '2026-04-01', deliveryDate: '2026-05-30',
    responsibleId: martin.id, priorityId: nizka.id,
    approval: 'Pending',
  },
  {
    description: 'H&S legal documentation — BIO/mng. Prevention of Serious',
    category: 'Safety & Compliance', subcategory: 'OHS',
    itemType: 'Service', unit: 'paušál', quantity: 1,
    totalEstCost: 89533, actualPrice: null,
    tenderStatus: 'Tender Planned',
    tenderStartDate: '2026-01-14', tenderDeadline: '2026-03-31',
    responsibleId: lucie.id, priorityId: vysoka.id,
    approval: 'Pending',
  },
  {
    description: 'H&S safety segregation of rack system protection',
    category: 'Facility', subcategory: 'Racking',
    itemType: 'CAPEX', unit: 'paušál', quantity: 1,
    totalEstCost: 350000, actualPrice: null,
    depreciationMonths: 120,
    tenderStatus: 'Tender Planned',
    tenderStartDate: '2026-01-14', tenderDeadline: '2026-03-31',
    orderPlaceDate: null, deliveryDate: '2026-06-30',
    responsibleId: jan.id, priorityId: krit.id,
    approval: 'Pending', capexNeeded: true,
    bottleneck: 'Závislost na schválení layoutu skladu',
  },
  {
    description: 'Communication displays — reservation system for truck drivers',
    category: 'IT Infrastructure', subcategory: 'Hardware',
    itemType: 'CAPEX', unit: 'ks', quantity: 8,
    totalEstCost: 160000, actualPrice: null,
    depreciationMonths: 36,
    tenderStatus: 'Tender Planned',
    tenderStartDate: '2026-01-14', tenderDeadline: '2026-03-15',
    orderPlaceDate: null, deliveryDate: '2026-05-01',
    responsibleId: tomas.id, priorityId: stredni.id,
    approval: 'Pending', capexNeeded: true,
  },
  {
    description: 'Electricity — new high power connection (200 kW extension)',
    category: 'Facility', subcategory: 'Electrical',
    itemType: 'CAPEX', unit: 'paušál', quantity: 1,
    totalEstCost: 2200000, additionalCostRevision: 180000, totalCostAfterRevision: 2380000,
    actualPrice: null, depreciationMonths: 240,
    tenderStatus: 'Tender Closed',
    tenderStartDate: '2025-09-01', tenderDeadline: '2025-12-31',
    orderPlaceDate: '2026-01-20', deliveryDate: '2026-09-30',
    responsibleId: jan.id, priorityId: krit.id,
    approval: 'Approved', capexNeeded: true,
    chosenSupplier: 'ČEZ Distribuce a.s.',
    bottleneck: 'Délka stavebního řízení — min. 6 měsíců',
    notes: 'Nutné pro provoz automatizace a nabíječky pro AGV',
  },
  {
    description: 'Dock levellers — hydraulic (4 docking positions)',
    category: 'Facility', subcategory: 'Docking',
    itemType: 'CAPEX', unit: 'ks', quantity: 4,
    totalEstCost: 480000, actualPrice: 462000,
    depreciationMonths: 120,
    tenderStatus: 'Implementation',
    tenderStartDate: '2025-10-01', tenderDeadline: '2025-11-30',
    orderPlaceDate: '2025-12-01', deliveryDate: '2026-03-15',
    responsibleId: jan.id, priorityId: vysoka.id,
    approval: 'Approved', capexNeeded: true,
    chosenSupplier: 'STERTIL-KONI CZ',
  },
  {
    description: 'Ventilation — mezzanine floor + QA area AC adjustment',
    category: 'Facility', subcategory: 'HVAC',
    itemType: 'CAPEX', unit: 'paušál', quantity: 1,
    totalEstCost: 320000, actualPrice: null,
    depreciationMonths: 60,
    tenderStatus: 'Not Tender Needed',
    orderPlaceDate: '2026-03-01', deliveryDate: '2026-05-31',
    responsibleId: jan.id, priorityId: stredni.id,
    approval: 'Pending', capexNeeded: true,
  },
  {
    description: 'Pallet racking extension — 1500 new locations',
    category: 'Facility', subcategory: 'Racking',
    itemType: 'CAPEX', unit: 'lokace', quantity: 1500,
    totalEstCost: 1650000, actualPrice: null,
    depreciationMonths: 120,
    tenderStatus: 'Tender Planned',
    tenderStartDate: '2026-02-15', tenderDeadline: '2026-04-15',
    orderPlaceDate: null, deliveryDate: '2026-08-01',
    responsibleId: jan.id, priorityId: vysoka.id,
    approval: 'Pending', capexNeeded: true,
    bottleneck: 'Lead time výrobce 14–18 týdnů',
  },
  {
    description: 'Security — securing of loading carriers (front area)',
    category: 'Safety & Compliance', subcategory: 'Fire Safety',
    itemType: 'One-off', unit: 'paušál', quantity: 1,
    totalEstCost: 95000, actualPrice: null,
    tenderStatus: 'Tender Planned',
    tenderStartDate: '2026-02-01', tenderDeadline: '2026-03-31',
    responsibleId: lucie.id, priorityId: vysoka.id,
    approval: 'Pending', capexNeeded: false,
  },
  {
    description: 'EMS financials reporting module upgrade',
    category: 'IT Infrastructure', subcategory: 'Software',
    itemType: 'Subscription', unit: 'rok', quantity: 1,
    totalEstCost: 185000, actualPrice: null,
    tenderStatus: 'Tender Closed',
    tenderStartDate: '2026-01-19', tenderDeadline: '2026-02-28',
    orderPlaceDate: '2026-03-01', deliveryDate: '2026-04-30',
    responsibleId: tomas.id, priorityId: stredni.id,
    approval: 'Pending',
  },
  {
    description: 'Network infrastructure upgrade — 10G backbone + WiFi 6',
    category: 'IT Infrastructure', subcategory: 'Network',
    itemType: 'CAPEX', unit: 'paušál', quantity: 1,
    totalEstCost: 420000, actualPrice: null,
    depreciationMonths: 60,
    tenderStatus: 'Not Tender Needed',
    orderPlaceDate: '2026-04-01', deliveryDate: '2026-06-30',
    responsibleId: tomas.id, priorityId: stredni.id,
    approval: 'Pending', capexNeeded: true,
  },
  {
    description: 'IT Device difference against original budget (overrun)',
    category: 'IT Infrastructure', subcategory: 'Hardware',
    itemType: 'One-off', unit: 'paušál', quantity: 1,
    totalEstCost: 68000, actualPrice: 83920,
    tenderStatus: 'Complete',
    tenderStartDate: '2026-01-01', tenderDeadline: '2026-01-31',
    orderPlaceDate: '2026-01-19', deliveryDate: '2026-02-10',
    responsibleId: tomas.id, priorityId: nizka.id,
    approval: 'Approved',
    notes: 'Navýšení kvůli kurzovým ztrátám USD/CZK',
  },
  {
    description: 'E-learning platform (Crossknowledge) annual licence',
    category: 'Fulfillment Equipment', subcategory: 'Training',
    itemType: 'Subscription', unit: 'rok', quantity: 1,
    totalEstCost: 95000, actualPrice: 95000,
    tenderStatus: 'Complete',
    tenderDeadline: '2026-01-31',
    orderPlaceDate: '2026-01-10', deliveryDate: '2026-01-15',
    responsibleId: petra.id, priorityId: nizka.id,
    approval: 'Approved',
    chosenSupplier: 'CrossKnowledge SAS',
  },
]

let created = 0
for (const item of items) {
  const r = await post('/api/items', item)
  if (r.id) created++
  else console.error('FAIL item:', JSON.stringify(r).slice(0, 200))
}
console.log(`✓ Items: ${created}/${items.length} vytvořeno`)

// ─── Labor costs (MD-based) ────────────────────────────────────
const laborRoles = [
  // mdRate = sazba za jeden MD (CZK), mdDays = počet man-days
  { role: 'Project Manager',           personName: 'Petra Nováková',  department: 'Operations', costType: 'Project', mdRate: 6500,  mdDays: 77,   notes: 'Dedikovaný PM — 77 MD @ 6 500 Kč' },
  { role: 'IT Project Manager',         personName: 'Tomáš Blaha',     department: 'IT',         costType: 'Project', mdRate: 7000,  mdDays: 64,   notes: '60% alokace, WMS + IT projekty' },
  { role: 'Implementation Manager',     personName: 'Martin Pospíšil', department: 'Operations', costType: 'Project', mdRate: 5800,  mdDays: 65,   notes: 'IM pro automatizaci' },
  { role: 'Facility Manager',           personName: 'Jan Dvořák',      department: 'Facility',   costType: 'Project', mdRate: 5200,  mdDays: 62,   notes: '50% alokace na projekt' },
  { role: 'Safety Officer',             personName: 'Lucie Marková',   department: 'Safety',     costType: 'Project', mdRate: 4800,  mdDays: 58 },
  { role: 'WMS Consultant (external)',  personName: null,              department: 'IT',         costType: 'Project', mdRate: 12000, mdDays: 95,   notes: 'Konzultant SAP — 12 měsíců' },
  { role: 'Project Coordinator',        personName: null,              department: 'Operations', costType: 'Project', mdRate: 3800,  mdDays: 58 },
  { role: 'Kickoff & Go-live support',  personName: null,              department: 'Operations', costType: 'One-off', mdRate: 8500,  mdDays: 10,   notes: 'Jednorázová podpora při spuštění' },
]

let laborCreated = 0
for (const lc of laborRoles) {
  const r = await post('/api/labor', lc)
  if (r.id) laborCreated++
  else console.error('FAIL labor:', JSON.stringify(r).slice(0, 200))
}
console.log(`✓ Labor: ${laborCreated}/${laborRoles.length} záznamů`)
console.log('\n🎉 Seed kompletní! Otevři http://localhost:3003')
