import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(__dirname, '../../data/hotelblock.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = OFF');

const USERS = db.prepare('SELECT id, name, role FROM users').all() as any[];
const USER_IDS = USERS.map(u => u.id);

const EXISTING_PROPS = db.prepare('SELECT id FROM properties').all() as any[];
let PROPERTY_ID: string | null = EXISTING_PROPS[0]?.id ?? null;

// Create a default property if none exists
if (!PROPERTY_ID) {
  PROPERTY_ID = uuidv4();
  db.prepare(`INSERT OR IGNORE INTO properties (id, name, address, city, phone, email, brand_color, active)
    VALUES (?, 'Aayor Grand Hotel', 'MG Road, Connaught Place', 'New Delhi', '+91-11-4567-8900', 'reservations@aayorgrand.com', '#2563eb', 1)`)
    .run(PROPERTY_ID);
  console.log('Created default property');
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min: number, max: number) { return Math.round((Math.random() * (max - min) + min) * 100) / 100; }
function daysAgo(d: number) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); }
function futureDays(d: number) { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10); }

const SEGMENTS = ['Rooms', 'Corporate', 'Events', 'Banquets'];
const CALL_TYPES = ['Cold Call', 'Follow-up', 'Inbound', 'Site Tour', 'Email Follow-up'];
const CALL_OUTCOMES = ['Interested', 'Callback Requested', 'Proposal Sent', 'Not Interested', 'No Answer', 'Closed Won', 'Closed Lost'];
const STAGES = ['Prospect', 'Qualified', 'Site Visit', 'Proposal Sent', 'Negotiation', 'Contracted', 'Closed Won', 'Closed Lost'];
const MEETING_PURPOSES = ['Sales Visit', 'Site Inspection', 'Proposal Presentation', 'Contract Signing', 'Relationship Building', 'Follow-up'];
const ACCOUNT_TYPES = ['Corporate', 'Travel Agency', 'Wedding Planner', 'Event Company', 'Government', 'Individual'];

const COMPANY_NAMES = [
  'Tata Consultancy Services', 'Infosys Technologies', 'Wipro Ltd', 'HCL Technologies', 'Tech Mahindra',
  'Reliance Industries', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'SBI Capital',
  'Dream Wedding Planners', 'Royal Events', 'Shaadi.com Events', 'WeddingBells India', 'Grand Celebrations',
  'Cox & Kings', 'Thomas Cook India', 'SOTC Travel', 'MakeMyTrip Corporate', 'Cleartrip Business',
  'Taj Hotels Corp', 'ITC Hospitality', 'Oberoi Realty', 'EIH Hotels', 'Leela Palaces',
  'Google India', 'Microsoft India', 'Amazon Web Services', 'Flipkart Pvt Ltd', 'Paytm Payments',
  'Mahindra & Mahindra', 'Bajaj Finserv', 'Adani Enterprises', 'L&T Construction', 'NTPC Ltd',
  'Zomato Events', 'Swiggy Corporate', 'Ola Cabs', 'Uber India', 'PhonePe',
  'Air India Corp', 'IndiGo Airlines', 'SpiceJet', 'Vistara Airlines', 'GoFirst',
  'FICCI', 'CII Federation', 'ASSOCHAM', 'PHD Chamber', 'IMC Mumbai',
  'EY India', 'Deloitte India', 'PwC Advisory', 'KPMG India', 'BCG India',
  'Maruti Suzuki', 'Hero MotoCorp', 'TVS Motors', 'Bajaj Auto', 'Ashok Leyland',
  'Apollo Hospitals', 'Fortis Healthcare', 'Max Healthcare', 'Manipal Hospitals', 'AIIMS Alumni',
  'Britannia Industries', 'Nestle India', 'HUL Consumer', 'ITC FMCG', 'Dabur India',
  'Star Sports Events', 'Sony Pictures', 'Zee Entertainment', 'BCCI Official', 'ISL Events',
  'Oberoi Events', 'Hyatt India', 'Marriott Corp', 'Hilton India', 'IHG Hotels',
  'Punjab National Bank', 'Bank of Baroda', 'Union Bank', 'Canara Bank', 'Indian Bank',
  'Kotak Mahindra', 'Yes Bank', 'Federal Bank', 'RBL Bank', 'IndusInd Bank',
];

const FIRST_NAMES = ['Amit', 'Priya', 'Rahul', 'Neha', 'Vikram', 'Sunita', 'Arun', 'Deepa', 'Sanjay', 'Kavita',
  'Rajesh', 'Anita', 'Suresh', 'Meena', 'Ramesh', 'Geeta', 'Mahesh', 'Usha', 'Dinesh', 'Lata',
  'Arjun', 'Pooja', 'Ravi', 'Sneha', 'Kiran', 'Nisha', 'Mohan', 'Rekha', 'Gopal', 'Sita',
  'Ajay', 'Divya', 'Vijay', 'Seema', 'Naveen', 'Asha', 'Prakash', 'Gita', 'Sunil', 'Mira',
  'Rohit', 'Radha', 'Vishal', 'Shilpa', 'Ankur', 'Jyoti', 'Abhishek', 'Swati', 'Nitin', 'Rani'];

const LAST_NAMES = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Shah', 'Joshi', 'Mehta', 'Nair',
  'Reddy', 'Rao', 'Pillai', 'Iyer', 'Krishnan', 'Malhotra', 'Kapoor', 'Bose', 'Das', 'Ghosh',
  'Chatterjee', 'Mukherjee', 'Banerjee', 'Tiwari', 'Pandey', 'Mishra', 'Agarwal', 'Jain', 'Saxena', 'Srivastava'];

const EVENT_TITLES = [
  'Annual Conference 2025', 'Product Launch Event', 'Board Meeting Q1', 'Sales Kickoff 2025',
  'Wedding Reception', 'Engagement Ceremony', 'Birthday Celebration', 'Anniversary Party',
  'Corporate Training', 'Team Offsite', 'Dealer Meet', 'Distributor Conference',
  'Industry Summit', 'Tech Conclave', 'Pharma Meet', 'Banking Summit',
  'Room Block - Corporate Rate', 'Bulk Room Booking', 'Crew Accommodation', 'Film Shoot Stay',
  'Banquet Hall - Diwali Party', 'Christmas Dinner', 'New Year Gala', 'Eid Celebrations',
  'MICE Package - 200 Pax', 'Incentive Trip Group', 'Fam Trip - 30 Agents', 'Study Tour',
  'Pre-Wedding Shoot', 'Destination Wedding Enquiry', 'Theme Wedding Package', 'Reception & Dinner',
];

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Goa',
  'Lucknow', 'Chandigarh', 'Kochi', 'Bhubaneswar', 'Indore', 'Nagpur', 'Surat', 'Vadodara'];

const COUNTRIES = ['India', 'UAE', 'UK', 'USA', 'Singapore', 'Malaysia', 'Thailand', 'Germany', 'France', 'Australia',
  'Canada', 'Japan', 'China', 'Sri Lanka', 'Nepal', 'Bangladesh'];

const AGENT_TYPES = ['Travel Agent', 'DMC', 'Corporate', 'OTA', 'MICE Agency', 'Wedding Planner', 'Tour Operator', 'Event Company'];
const AGENT_FREQS = ['Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Bi-annual', 'Annual'];
const FREQ_DAYS: Record<string, number> = { Weekly: 7, Fortnightly: 14, Monthly: 30, Quarterly: 90, 'Bi-annual': 180, Annual: 365 };
const TIERS = ['A', 'A', 'B', 'B', 'B', 'C', 'C', 'D'];

const now = new Date().toISOString();

console.log('🌱 Starting seed...');

// ── 1. ACCOUNTS (80) ──────────────────────────────────────────────────────────
const existingAccounts = db.prepare('SELECT COUNT(*) as c FROM accounts').get() as any;
let accountIds: string[] = db.prepare('SELECT id FROM accounts').all().map((r: any) => r.id);

if (existingAccounts.c < 80) {
  const insertAccount = db.prepare(`INSERT OR IGNORE INTO accounts (id,name,type,phone,email,address,notes,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const txn = db.transaction(() => {
    for (let i = 0; i < 80; i++) {
      const id = uuidv4();
      const city = pick(CITIES);
      const name = pick(COMPANY_NAMES) + (rand(1,3) > 1 ? ` ${pick(['Pvt Ltd','Ltd','Corp','India','Group','Foundation'])}` : '');
      insertAccount.run(id, name, pick(ACCOUNT_TYPES), `+91-${rand(70000,99999)}-${rand(10000,99999)}`,
        `contact${rand(100,999)}@${name.toLowerCase().replace(/[^a-z]/g,'').slice(0,10)}.com`,
        `${rand(1,999)}, ${pick(['MG Road','Park Street','Sector 5','Bandra West','Koramangala'])}, ${city}`,
        `Key account from ${city}. ${pick(['High potential', 'Regular client', 'New prospect', 'Referred account'])}.`,
        pick(USER_IDS), daysAgo(rand(10,365)));
      accountIds.push(id);
    }
  });
  txn();
  console.log(`✅ Accounts: ${accountIds.length}`);
}

// ── 2. CONTACTS (150) ─────────────────────────────────────────────────────────
let contactIds: string[] = db.prepare('SELECT id FROM contacts').all().map((r: any) => r.id);
const existingContacts = db.prepare('SELECT COUNT(*) as c FROM contacts').get() as any;

if (existingContacts.c < 150) {
  const insertContact = db.prepare(`INSERT OR IGNORE INTO contacts (id,name,email,phone,title,notes,account_id,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const DESIGS = ['Director', 'Manager', 'Executive', 'CEO', 'CFO', 'VP Sales', 'Head HR', 'GM', 'DGM', 'Coordinator'];
  const txn = db.transaction(() => {
    for (let i = 0; i < 150; i++) {
      const id = uuidv4();
      const fn = pick(FIRST_NAMES), ln = pick(LAST_NAMES);
      const desig = pick(DESIGS);
      insertContact.run(id, `${fn} ${ln}`, `${fn.toLowerCase()}.${ln.toLowerCase()}${rand(10,99)}@gmail.com`,
        `+91-${rand(70000,99999)}-${rand(10000,99999)}`, `${desig} at ${pick(COMPANY_NAMES)}`,
        `${pick(['Decision maker', 'Key contact', 'Influencer', 'End user'])}. Prefers ${pick(['email', 'WhatsApp', 'phone call'])} communication.`,
        rand(1, 10) > 3 ? pick(accountIds) : null, pick(USER_IDS), daysAgo(rand(5,300)));
      contactIds.push(id);
    }
  });
  txn();
  console.log(`✅ Contacts: ${contactIds.length}`);
}

// ── 3. CALLS (500) ───────────────────────────────────────────────────────────
const existingCalls = db.prepare('SELECT COUNT(*) as c FROM calls').get() as any;
if (existingCalls.c < 500) {
  const insertCall = db.prepare(`INSERT INTO calls (id,user_id,contact_name,company,phone,segment,call_type,duration_min,outcome,notes,next_action,next_action_date,property_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const txn = db.transaction(() => {
    for (let i = 0; i < 500; i++) {
      const fn = pick(FIRST_NAMES), ln = pick(LAST_NAMES);
      const outcome = pick(CALL_OUTCOMES);
      const nextActions = ['Send proposal', 'Schedule site visit', 'Follow up next week', 'Share rate card', 'Call back in 3 days', ''];
      insertCall.run(
        uuidv4(), pick(USER_IDS), `${fn} ${ln}`, pick(COMPANY_NAMES),
        `+91-${rand(70000,99999)}-${rand(10000,99999)}`,
        pick(SEGMENTS), pick(CALL_TYPES), rand(2, 45), outcome,
        `Discussed ${pick(['room rates', 'event space', 'banquet packages', 'corporate deal', 'MICE requirements', 'wedding enquiry', 'bulk booking'])}. Client ${pick(['seemed interested', 'asked for quote', 'wants to visit', 'will discuss internally', 'has budget constraints'])}. ${pick(['Follow up in 3 days', 'Sent email', 'Shared brochure', 'Booked site visit', ''])}`,
        pick(nextActions), rand(1,4) > 1 ? futureDays(rand(1, 14)) : null,
        PROPERTY_ID, daysAgo(rand(0, 180))
      );
    }
  });
  txn();
  console.log(`✅ Calls: 500`);
}

// ── 4. MEETINGS (200) ────────────────────────────────────────────────────────
const existingMeetings = db.prepare('SELECT COUNT(*) as c FROM meetings').get() as any;
if (existingMeetings.c < 200) {
  const insertMeeting = db.prepare(`INSERT INTO meetings (id,user_id,contact_name,company,address_label,segment,purpose,notes,outcome,property_id,meeting_date,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const txn = db.transaction(() => {
    for (let i = 0; i < 200; i++) {
      const fn = pick(FIRST_NAMES), ln = pick(LAST_NAMES);
      const meetDate = daysAgo(rand(0, 120));
      insertMeeting.run(
        uuidv4(), pick(USER_IDS), `${fn} ${ln}`, pick(COMPANY_NAMES),
        `${rand(1, 999)}, ${pick(['MG Road', 'Park Street', 'Bandra West', 'Koramangala', 'Cyber City', 'Hiranandani'])}, ${pick(CITIES)}`,
        pick(SEGMENTS), pick(MEETING_PURPOSES),
        `Met with client to ${pick(['discuss event requirements', 'present banquet options', 'review proposal', 'sign contract', 'conduct site inspection', 'finalize room block dates'])}. ${pick(['Client was impressed', 'Positive response', 'Decision pending', 'Follow-up meeting scheduled', 'Proposal shared on-site'])}.`,
        pick(['Meeting Done', 'Site Shown', 'Proposal Shared', 'Contract Signed', 'Follow-up Required']),
        PROPERTY_ID, meetDate, meetDate
      );
    }
  });
  txn();
  console.log(`✅ Meetings: 200`);
}

// ── 5. LEADS / PIPELINE (300) ────────────────────────────────────────────────
const existingLeads = db.prepare('SELECT COUNT(*) as c FROM leads').get() as any;
if (existingLeads.c < 300) {
  const insertLead = db.prepare(`INSERT INTO leads (id,user_id,account_id,contact_id,title,segment,stage,estimated_revenue,event_date,room_nights,pax,notes,property_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const REVENUE_BY_SEG: Record<string, [number,number]> = {
    Rooms: [50000, 500000], Corporate: [100000, 2000000], Events: [200000, 5000000], Banquets: [150000, 3000000]
  };
  const txn = db.transaction(() => {
    for (let i = 0; i < 300; i++) {
      const seg = pick(SEGMENTS);
      const [minR, maxR] = REVENUE_BY_SEG[seg];
      const createdAt = daysAgo(rand(0, 200));
      insertLead.run(
        uuidv4(), pick(USER_IDS), rand(1,3) > 1 ? pick(accountIds) : null, rand(1,3) > 1 ? pick(contactIds) : null,
        pick(EVENT_TITLES), seg, pick(STAGES), rand(minR/1000, maxR/1000) * 1000,
        futureDays(rand(7, 180)), rand(0, 200), rand(10, 500),
        `${pick(['Client enquired via', 'Referred by agent', 'Walk-in visit', 'Website inquiry', 'Cold call converted'])} ${pick(['email', 'phone', 'WhatsApp', 'reference', 'website'])}. ${pick(['Budget is', 'Requirements:', 'Expected dates:', 'Special request:'])} ${pick(['flexible', 'confirmed', 'tentative', 'under review'])}.`,
        PROPERTY_ID, createdAt, createdAt
      );
    }
  });
  txn();
  console.log(`✅ Leads: 300`);
}

// ── 6. AGENTS (100) ──────────────────────────────────────────────────────────
const existingAgents = db.prepare('SELECT COUNT(*) as c FROM agents').get() as any;
if (existingAgents.c < 100) {
  const insertAgent = db.prepare(`INSERT INTO agents (id,name,agency_name,type,country,city,phone,email,tier,status,specialization,assigned_to,property_id,notes,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertFollowup = db.prepare(`INSERT OR IGNORE INTO agent_followups (id,agent_id,user_id,frequency,frequency_days,last_contact_date,next_due_date,created_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  const SPECS = ['Leisure', 'Business / Corporate', 'MICE', 'Wedding & Social', 'Groups & FIT', 'Luxury', 'Budget'];
  const AGENT_NAMES_FIRST = ['Anwar', 'Pradeep', 'Meera', 'Farhan', 'Kalpana', 'Sudhir', 'Lakshmi', 'Zaheer', 'Chandini', 'Brijesh',
    'Fatima', 'Govindaraj', 'Hema', 'Imran', 'Jayalakshmi', 'Kartik', 'Leela', 'Manohar', 'Nagma', 'Onkar',
    'Pavani', 'Qureshi', 'Rajani', 'Santosh', 'Tulsi', 'Upendra', 'Vanitha', 'Wasim', 'Xenia', 'Yusuf'];
  const AGENCY_NAMES = [
    'Wanderlust Tours', 'Global Horizons Travel', 'Elite Voyages', 'Sunshine Travel Agency', 'Royal Travels',
    'Galaxy Tours & Travels', 'Star DMC India', 'Nexus Travel Solutions', 'Prime Events', 'Cosmos MICE',
    'Heritage Holidays', 'Nile Travels', 'Pacific DMC', 'Zenith Inbound', 'Oceanic Tours',
    'Discover India Tours', 'Adventure Trails', 'Luxury Escapes India', 'Pilgrim Travel', 'Festival Tours',
    'Maldives Holidays', 'Dubai Connect DMC', 'Singapore Select', 'Bangkok Transfers', 'London Eye Travel',
    'Booking.com Partners', 'Expedia B2B', 'MakeMyTrip Partners', 'Yatra Corporate', 'Cleartrip B2B',
  ];
  const txn = db.transaction(() => {
    for (let i = 0; i < 100; i++) {
      const agentId = uuidv4();
      const fn = pick(AGENT_NAMES_FIRST), ln = pick(LAST_NAMES);
      const freq = pick(AGENT_FREQS);
      const freqDays = FREQ_DAYS[freq];
      const assignedTo = pick(USER_IDS);
      const tier = pick(TIERS);
      const country = rand(1,3) > 1 ? 'India' : pick(COUNTRIES);
      const lastContactDaysAgo = rand(0, freqDays * 2);
      const lastContact = rand(1,3) > 1 ? daysAgo(lastContactDaysAgo).slice(0, 10) : null;
      let nextDue: string | null = null;
      if (lastContact) {
        const nd = new Date(lastContact); nd.setDate(nd.getDate() + freqDays);
        nextDue = nd.toISOString().slice(0, 10);
      }
      insertAgent.run(agentId, `${fn} ${ln}`, pick(AGENCY_NAMES), pick(AGENT_TYPES), country,
        country === 'India' ? pick(CITIES) : pick(['Dubai', 'London', 'Singapore', 'New York', 'Sydney', 'Frankfurt']),
        `+${rand(91, 971)}-${rand(70000, 99999)}-${rand(10000, 99999)}`,
        `${fn.toLowerCase()}.${ln.toLowerCase()}@${pick(['gmail.com','yahoo.com','outlook.com','hotmail.com','agencymail.com'])}`,
        tier, rand(1,10) > 1 ? 'Active' : 'Dormant',
        pick(SPECS), assignedTo, PROPERTY_ID,
        `${pick(['Key account', 'Good volume', 'Regular booker', 'New contact', 'Referred by colleague', 'Met at trade show'])}. ${pick(['Primarily sends', 'Handles'])} ${pick(['FIT clients', 'group bookings', 'MICE events', 'wedding groups', 'corporate accounts'])}.`,
        assignedTo, daysAgo(rand(30, 365)));
      insertFollowup.run(uuidv4(), agentId, assignedTo, freq, freqDays, lastContact, nextDue, now);
    }
  });
  txn();
  console.log(`✅ Agents: 100`);
}

// ── 7. TASKS (100) ───────────────────────────────────────────────────────────
const existingTasks = db.prepare('SELECT COUNT(*) as c FROM tasks').get() as any;
if (existingTasks.c < 100) {
  const insertTask = db.prepare(`INSERT INTO tasks (id,user_id,title,due_date,completed,lead_id,created_at)
    VALUES (?,?,?,?,?,?,?)`);
  const TASK_TITLES = [
    'Send proposal to client', 'Follow up on site visit', 'Share rate card', 'Confirm booking details',
    'Send contract draft', 'Collect advance payment', 'Confirm F&B menu', 'Arrange site inspection',
    'Send welcome kit', 'Follow up with travel agent', 'Share availability calendar', 'Confirm group size',
    'Send revised proposal', 'Collect event brief', 'Coordinate with operations team', 'Follow up after meeting',
    'Send thank you email', 'Share photos of venue', 'Confirm event date', 'Review contract terms',
  ];
  const leadIds = db.prepare('SELECT id FROM leads LIMIT 100').all().map((r: any) => r.id);
  const txn = db.transaction(() => {
    for (let i = 0; i < 100; i++) {
      insertTask.run(
        uuidv4(), pick(USER_IDS), pick(TASK_TITLES),
        futureDays(rand(-5, 15)), rand(0, 1),
        rand(1, 3) > 1 ? pick(leadIds) : null, daysAgo(rand(0, 30))
      );
    }
  });
  txn();
  console.log(`✅ Tasks: 100`);
}

// ── 8. AGENT ACTIVITY LOGS ───────────────────────────────────────────────────
const existingLogs = db.prepare('SELECT COUNT(*) as c FROM agent_activity_log').get() as any;
if (existingLogs.c < 200) {
  const agentIds = db.prepare('SELECT id FROM agents LIMIT 100').all().map((r: any) => r.id);
  const insertLog = db.prepare(`INSERT INTO agent_activity_log (id,agent_id,user_id,type,outcome,notes,contacted_at,created_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  const LOG_TYPES = ['Call', 'Email', 'WhatsApp', 'Meeting', 'Rate Sheet Sent', 'Newsletter'];
  const LOG_OUTCOMES = ['Interested', 'Sent Rates', 'Booked', 'No Response', 'Follow-up Needed', 'Meeting Scheduled'];
  const txn = db.transaction(() => {
    for (let i = 0; i < 200; i++) {
      const contactedAt = daysAgo(rand(0, 90));
      insertLog.run(uuidv4(), pick(agentIds), pick(USER_IDS), pick(LOG_TYPES), pick(LOG_OUTCOMES),
        `${pick(['Discussed upcoming season rates', 'Shared new packages', 'Followed up on pending booking', 'Sent promotional material', 'Confirmed group dates', 'Reviewed last quarter volume'])}.`,
        contactedAt, contactedAt);
    }
  });
  txn();
  console.log(`✅ Agent activity logs: 200`);
}

// ── 9. PROPOSALS (120) ───────────────────────────────────────────────────────
const existingProposals = db.prepare('SELECT COUNT(*) as c FROM proposals').get() as any;
if (existingProposals.c < 100) {
  const leadRows = db.prepare('SELECT id, title, segment FROM leads').all() as { id: string; title: string; segment: string }[];
  const insertProposal = db.prepare(`INSERT INTO proposals
    (id,lead_id,user_id,property_id,title,ref_number,status,client_name,client_company,client_phone,client_email,
     event_date,event_type,venue,pax,validity_date,payment_terms,cancellation_policy,
     tax_percent,discount,total_value,line_items,photos,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const EVENT_TYPES = ['Conference', 'Wedding', 'Corporate Offsite', 'Product Launch', 'Banquet Dinner', 'Board Meeting', 'Incentive Trip', 'Social Gathering'];
  const VENUES = ['Grand Ballroom', 'Lawn & Pool Deck', 'Boardroom A', 'Banquet Hall 1', 'Rooftop Terrace', 'Crystal Hall', 'Multiple Venues'];
  const STATUSES = ['Draft', 'Draft', 'Sent', 'Sent', 'Sent', 'Accepted', 'Accepted', 'Rejected'];
  const PAYMENT = [
    '50% advance on confirmation, balance 7 days before the event.',
    '30% advance, 40% 15 days prior, balance on the event day.',
    '100% advance for room blocks. Banquet billed on actual consumption.',
    'Corporate credit — invoice within 15 days of checkout.',
  ];
  const CANCEL = [
    'Free cancellation up to 21 days before the event. 50% charge within 21–7 days. 100% within 7 days.',
    'Room block: release unsold rooms 14 days prior at no charge. Inside 14 days, one night retention.',
    '25% retention if cancelled within 30 days. 75% within 15 days. No refund inside 7 days.',
  ];
  const ITEM_BANK: { section: string; description: string; rate: number }[] = [
    { section: 'Accommodation', description: 'Deluxe Room — Single occupancy', rate: 8500 },
    { section: 'Accommodation', description: 'Deluxe Room — Double occupancy', rate: 10500 },
    { section: 'Accommodation', description: 'Suite upgrade', rate: 18000 },
    { section: 'Food & Beverage', description: 'Welcome hi-tea', rate: 750 },
    { section: 'Food & Beverage', description: 'Lunch buffet — veg & non-veg', rate: 1450 },
    { section: 'Food & Beverage', description: 'Gala dinner with live counters', rate: 2200 },
    { section: 'Food & Beverage', description: 'Coffee break (2 services)', rate: 450 },
    { section: 'Event Services', description: 'Ballroom rental — full day', rate: 85000 },
    { section: 'Event Services', description: 'Meeting room — half day', rate: 25000 },
    { section: 'Event Services', description: 'Stage, podium and branding wall', rate: 35000 },
    { section: 'AV & Decor', description: 'LED wall and sound system', rate: 45000 },
    { section: 'AV & Decor', description: 'Floral decor package', rate: 60000 },
    { section: 'AV & Decor', description: 'Uplighting and dance floor', rate: 28000 },
    { section: 'Transfers & Logistics', description: 'Airport transfers — sedan', rate: 2200 },
    { section: 'Transfers & Logistics', description: 'Coach transfer — 35 seater', rate: 8500 },
    { section: 'Other', description: 'Service charge and coordination', rate: 15000 },
  ];

  const need = 120 - existingProposals.c;
  const txn = db.transaction(() => {
    for (let i = 0; i < need; i++) {
      const n = existingProposals.c + i + 1;
      const fn = pick(FIRST_NAMES), ln = pick(LAST_NAMES);
      const company = pick(COMPANY_NAMES);
      const lead = leadRows.length ? pick(leadRows) : null;
      const items = Array.from({ length: rand(3, 6) }, () => {
        const base = pick(ITEM_BANK);
        return { section: base.section, description: base.description, qty: rand(1, 80), rate: base.rate };
      });
      const subtotal = items.reduce((s, it) => s + it.qty * it.rate, 0);
      const discount = rand(0, 4) === 0 ? rand(5000, 25000) : 0;
      const taxPercent = pick([5, 12, 18]);
      const total = Math.round((subtotal - discount) * (1 + taxPercent / 100));
      const created = daysAgo(rand(0, 120));
      const eventDate = futureDays(rand(10, 180));
      const valid = futureDays(rand(7, 45));
      insertProposal.run(
        uuidv4(), lead?.id || null, pick(USER_IDS), PROPERTY_ID,
        lead?.title || pick(EVENT_TITLES),
        `PROP-2026-${String(n).padStart(3, '0')}`,
        pick(STATUSES),
        `${fn} ${ln}`, company,
        `+91-${rand(70000, 99999)}-${rand(10000, 99999)}`,
        `${fn.toLowerCase()}.${ln.toLowerCase()}${rand(10, 99)}@gmail.com`,
        eventDate, pick(EVENT_TYPES), pick(VENUES), rand(20, 400), valid,
        pick(PAYMENT), pick(CANCEL),
        taxPercent, discount, total, JSON.stringify(items), '[]',
        `Proposal prepared for ${company}. ${pick(['Client requested a revised menu', 'Includes one complimentary suite for the host', 'AV requirements confirmed with operations', 'Rates valid for the quoted dates only', 'Group rate subject to rooming list 21 days prior'])}.`,
        created, created
      );
    }
  });
  txn();
  console.log(`✅ Proposals: ${need} added`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
const summary = {
  accounts: (db.prepare('SELECT COUNT(*) as c FROM accounts').get() as any).c,
  contacts: (db.prepare('SELECT COUNT(*) as c FROM contacts').get() as any).c,
  calls: (db.prepare('SELECT COUNT(*) as c FROM calls').get() as any).c,
  meetings: (db.prepare('SELECT COUNT(*) as c FROM meetings').get() as any).c,
  leads: (db.prepare('SELECT COUNT(*) as c FROM leads').get() as any).c,
  agents: (db.prepare('SELECT COUNT(*) as c FROM agents').get() as any).c,
  tasks: (db.prepare('SELECT COUNT(*) as c FROM tasks').get() as any).c,
  proposals: (db.prepare('SELECT COUNT(*) as c FROM proposals').get() as any).c,
};
console.log('\n📊 Database totals:', summary);
console.log('🎉 Seed complete!\n');
