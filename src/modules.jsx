import React, { useMemo, useState } from 'react';
import {
  Search, SlidersHorizontal, Plus, Download, MoreHorizontal, ChevronRight,
  X, CheckCircle2, Clock3, CircleDollarSign, Users, FolderKanban, Package,
  ShieldCheck, FileText, UserRound, Eye, Pencil, Archive, ArrowUpRight,
  Upload, CalendarDays, MapPin, CircleAlert, ListFilter, Columns3
} from 'lucide-react';
import { attendanceApi, recordsApi, sessionStore } from './api.js';

// Each module owns a distinct dataset per tab (columns + rows), or the marker
// string 'kanban' / 'pipeline' for the two tabs that render a custom visual
// view instead of a table. This keeps every tab genuinely different rather
// than all tabs sharing one table.
const definitions = {
  CRM: {
    eyebrow: 'Customer relationships', title: 'CRM & Customers', action: 'Add customer',
    stats: [['Total customers','1,284','+12.5%'],['Active leads','86','+8.4%'],['Pipeline value','$184,200','+18.2%'],['Conversion rate','31.6%','+2.8%']],
    tabs: {
      Customers: { columns: ['Customer','Contact','Assigned to','Total value','Status'], rows: [
        ['ABC Construction','contact@abcbuild.com','Sarah Miller','$48,750','Active'],
        ['BuildTech LLC','hello@buildtech.io','Michael Chen','$32,400','Active'],
        ['Luma Studio','admin@lumastudio.co','Sarah Miller','$18,920','Lead'],
        ['Northstar Co.','info@northstar.com','David Brown','$27,600','Active'],
        ['Conakry Print House','ops@cph.gn','Mariam Diallo','$14,280','Follow-up']
      ]},
      Leads: { columns: ['Lead','Source','Assigned to','Est. value','Status'], rows: [
        ['Horizon Retail Group','Website','Sarah Miller','$22,000','New'],
        ['Coastal Logistics','Referral','Michael Chen','$14,500','Contacted'],
        ['Fresh Market Chain','Trade show','Sarah Miller','$31,200','Qualified'],
        ['Delta Engineering','Cold outreach','David Brown','$8,900','Meeting scheduled'],
        ['Kindia Textiles','Website','Mariam Diallo','$17,600','Proposal requested']
      ]},
      Pipeline: 'pipeline',
      Activities: { columns: ['Activity','Customer','Type','Date','Status'], rows: [
        ['Discovery call','Horizon Retail Group','Call','Today, 11:00 AM','Scheduled'],
        ['Contract follow-up','BuildTech LLC','Email','Today, 09:14 AM','Sent'],
        ['Site visit','Northstar Co.','Meeting','Yesterday','Completed'],
        ['Proposal review','Fresh Market Chain','Meeting','May 29, 2026','Completed'],
        ['Renewal reminder','Luma Studio','Email','May 28, 2026','Sent']
      ]}
    }
  },
  Sales: {
    eyebrow: 'Revenue operations', title: 'Sales & Quotations', action: 'New quotation',
    stats: [['Open quotations','38','+6'],['Quoted value','$126,480','+14.2%'],['Awaiting approval','8','-2'],['Win rate','42.8%','+4.1%']],
    tabs: {
      Quotations: { columns: ['Quotation','Customer','Issue date','Amount','Status'], rows: [
        ['QUO-2026-0041','ABC Construction','May 31, 2026','$18,500','Accepted'],
        ['QUO-2026-0040','BuildTech LLC','May 30, 2026','$12,800','Viewed'],
        ['QUO-2026-0039','Luma Studio','May 28, 2026','$8,400','Sent'],
        ['QUO-2026-0038','Northstar Co.','May 27, 2026','$21,750','Pending approval'],
        ['QUO-2026-0037','Apex Retail','May 25, 2026','$6,250','Draft']
      ]},
      Proposals: { columns: ['Proposal','Customer','Prepared by','Value','Status'], rows: [
        ['Annual Retainer Proposal','Luma Studio','Sarah Miller','$36,000','Sent'],
        ['Fleet Signage Proposal','Northstar Co.','Michael Chen','$14,200','Draft'],
        ['E-commerce Build Proposal','Apex Retail','David Brown','$52,800','Accepted'],
        ['Maintenance Plan Proposal','ABC Construction','Sarah Miller','$9,600','Viewed']
      ]},
      Approvals: { columns: ['Quotation','Requested by','Discount','Amount','Status'], rows: [
        ['QUO-2026-0038','David Brown','15%','$21,750','Pending approval'],
        ['QUO-2026-0035','Michael Chen','22%','$9,400','Pending approval'],
        ['QUO-2026-0031','Sarah Miller','10%','$16,200','Approved'],
        ['QUO-2026-0029','Mariam Diallo','18%','$5,800','Rejected']
      ]},
      'Services catalog': { columns: ['Service','Category','Default price','Duration','Status'], rows: [
        ['Website Development','Development','$8,500','6 weeks','Active'],
        ['Vehicle Wrapping','Printing','$1,200','2 days','Active'],
        ['Brand Identity Package','Design','$4,800','3 weeks','Active'],
        ['Social Media Management','Marketing','$1,500 / mo','Ongoing','Active'],
        ['DTF Printing — per m²','Printing','$18','Same day','Active']
      ]}
    }
  },
  Projects: {
    eyebrow: 'Delivery & execution', title: 'Projects', action: 'Create project',
    stats: [['Active projects','24','+3'],['On track','18','75%'],['At risk','4','16.7%'],['Completed this month','12','+20%']],
    tabs: {
      'All projects': { columns: ['Project','Customer','Manager','Due date','Status'], rows: [
        ['Mobile App Development','BuildTech LLC','Michael Chen','Jun 24, 2026','In progress'],
        ['Website Redesign','ABC Construction','Sarah Miller','Jun 12, 2026','In progress'],
        ['Brand Identity','Luma Studio','Emma Wilson','Jun 08, 2026','Under review'],
        ['Office Signage','Northstar Co.','David Brown','Jun 05, 2026','Quality control'],
        ['E-commerce Platform','Apex Retail','Michael Chen','Jul 18, 2026','Awaiting deposit']
      ]},
      Kanban: 'kanban',
      Tasks: { columns: ['Task','Project','Assigned to','Due date','Status'], rows: [
        ['Design homepage mockups','Website Redesign','Emma Wilson','Jun 02, 2026','In progress'],
        ['API integration','Mobile App Development','Michael Chen','Jun 06, 2026','In progress'],
        ['Logo concepts round 2','Brand Identity','Emma Wilson','May 30, 2026','Completed'],
        ['Install mounting brackets','Office Signage','David Brown','Jun 01, 2026','Not started'],
        ['Payment gateway testing','E-commerce Platform','Michael Chen','Jul 10, 2026','Not started']
      ]},
      Milestones: { columns: ['Milestone','Project','Target date','Owner','Status'], rows: [
        ['Design approval','Website Redesign','Jun 05, 2026','Sarah Miller','Pending approval'],
        ['Beta release','Mobile App Development','Jun 20, 2026','Michael Chen','On track'],
        ['Brand guide delivery','Brand Identity','Jun 08, 2026','Emma Wilson','On track'],
        ['Installation complete','Office Signage','Jun 06, 2026','David Brown','At risk']
      ]},
      Files: { columns: ['File','Project','Uploaded by','Size','Status'], rows: [
        ['homepage-mockup-v3.fig','Website Redesign','Emma Wilson','24 MB','Shared'],
        ['api-spec.pdf','Mobile App Development','Michael Chen','1.2 MB','Internal'],
        ['brand-guidelines-draft.pdf','Brand Identity','Emma Wilson','8.6 MB','Shared'],
        ['signage-permit.pdf','Office Signage','David Brown','640 KB','Confidential']
      ]},
      'Client approvals': { columns: ['Item','Project','Customer','Requested','Status'], rows: [
        ['Homepage design v3','Website Redesign','ABC Construction','Jun 01, 2026','Pending approval'],
        ['Final logo set','Brand Identity','Luma Studio','May 29, 2026','Approved'],
        ['Signage placement plan','Office Signage','Northstar Co.','May 27, 2026','Changes requested'],
        ['App wireframes','Mobile App Development','BuildTech LLC','May 24, 2026','Approved']
      ]}
    }
  },
  Contracts: {
    eyebrow: 'Agreement lifecycle', title: 'Contracts', action: 'New contract',
    stats: [['Active contracts','42','+5'],['Awaiting signature','7','-1'],['Fully executed','31','73.8%'],['Contract value','$482,900','+11.4%']],
    tabs: {
      'All contracts': { columns: ['Contract','Customer','Type','Value','Status'], rows: [
        ['CTR-2026-0015','BuildTech LLC','Development','$18,500','Fully executed'],
        ['CTR-2026-0014','ABC Construction','Website','$24,000','Customer signed'],
        ['CTR-2026-0013','Luma Studio','Branding','$9,800','Awaiting signature'],
        ['CTR-2026-0012','Northstar Co.','Installation','$32,750','Internal review'],
        ['CTR-2026-0011','Apex Retail','Maintenance','$12,000','Draft']
      ]},
      Templates: { columns: ['Template','Category','Last updated','Used in','Status'], rows: [
        ['General Service Agreement','General','May 12, 2026','18 contracts','Active'],
        ['Software Development Agreement','Development','May 20, 2026','9 contracts','Active'],
        ['Printing Agreement','Printing','Apr 30, 2026','24 contracts','Active'],
        ['Monthly Retainer Agreement','Marketing','May 02, 2026','6 contracts','Active'],
        ['Non-Disclosure Agreement','Legal','Mar 18, 2026','11 contracts','Active']
      ]},
      'Awaiting signature': { columns: ['Contract','Customer','Sent date','Reminder sent','Status'], rows: [
        ['CTR-2026-0013','Luma Studio','May 26, 2026','Yes','Awaiting signature'],
        ['CTR-2026-0009','Kindia Textiles','May 22, 2026','Yes','Awaiting signature'],
        ['CTR-2026-0007','Coastal Logistics','May 18, 2026','No','Awaiting signature']
      ]},
      Versions: { columns: ['Contract','Version','Changed by','Date','Status'], rows: [
        ['CTR-2026-0015','v3 (final)','John Doe','May 31, 2026','Locked'],
        ['CTR-2026-0015','v2','Sarah Miller','May 20, 2026','Superseded'],
        ['CTR-2026-0014','v1','Sarah Miller','May 15, 2026','Locked'],
        ['CTR-2026-0012','v2','David Brown','May 10, 2026','Draft']
      ]},
      Approvals: { columns: ['Contract','Requested by','Value','Submitted','Status'], rows: [
        ['CTR-2026-0012','David Brown','$32,750','May 29, 2026','Pending approval'],
        ['CTR-2026-0011','Sarah Miller','$12,000','May 27, 2026','Approved'],
        ['CTR-2026-0010','Michael Chen','$41,200','May 24, 2026','Approved']
      ]}
    }
  },
  Finance: {
    eyebrow: 'Financial operations', title: 'Finance', action: 'Record payment',
    stats: [['Total revenue','$128,540','+18.4%'],['Receivables','$30,120','-5.6%'],['Expenses','$42,860','+2.1%'],['Estimated profit','$55,560','+24.2%']],
    tabs: {
      Invoices: { columns: ['Document','Customer','Date','Amount','Status'], rows: [
        ['INV-2026-0084','ABC Construction','May 31, 2026','$12,450','Paid'],
        ['INV-2026-0083','BuildTech LLC','May 29, 2026','$18,500','Partial'],
        ['INV-2026-0082','Luma Studio','May 27, 2026','$6,250','Overdue'],
        ['INV-2026-0081','Northstar Co.','May 24, 2026','$9,800','Paid'],
        ['INV-2026-0080','Apex Retail','May 21, 2026','$14,750','Pending']
      ]},
      Payments: { columns: ['Payment','Customer','Method','Amount','Status'], rows: [
        ['PMT-2026-0112','ABC Construction','Bank transfer','$12,450','Verified'],
        ['PMT-2026-0111','BuildTech LLC','Orange Money','$9,250','Verified'],
        ['PMT-2026-0110','Luma Studio','Cash','$3,000','Pending verification'],
        ['PMT-2026-0109','Northstar Co.','Check','$9,800','Verified']
      ]},
      Receipts: { columns: ['Receipt','Customer','Invoice','Amount','Status'], rows: [
        ['RCP-2026-0048','ABC Construction','INV-2026-0084','$12,450','Issued'],
        ['RCP-2026-0047','Northstar Co.','INV-2026-0081','$9,800','Issued'],
        ['RCP-2026-0046','BuildTech LLC','INV-2026-0083','$9,250','Issued']
      ]},
      'Customer balances': { columns: ['Customer','Invoiced','Paid','Balance','Status'], rows: [
        ['ABC Construction','$61,200','$61,200','$0','Active'],
        ['BuildTech LLC','$36,750','$18,250','$18,500','Partial'],
        ['Luma Studio','$18,920','$12,670','$6,250','Overdue'],
        ['Apex Retail','$14,750','$0','$14,750','Pending']
      ]},
      Expenses: { columns: ['Expense','Category','Submitted by','Amount','Status'], rows: [
        ['Vinyl stock — May restock','Materials','David Brown','$4,280','Approved'],
        ['Fuel — delivery van','Transportation','Ibrahim Camara','$186','Approved'],
        ['Adobe Creative Cloud','Software subscriptions','Emma Wilson','$240','Pending approval'],
        ['Office electricity — May','Electricity','Mariam Diallo','$310','Paid']
      ]},
      Refunds: { columns: ['Refund','Customer','Original payment','Amount','Status'], rows: [
        ['REF-2026-0004','Northstar Co.','PMT-2026-0098','$1,200','Issued'],
        ['REF-2026-0003','Apex Retail','PMT-2026-0091','$450','Pending approval']
      ]},
      Reports: { columns: ['Report','Category','Owner','Last generated','Status'], rows: [
        ['Monthly revenue summary','Finance','John Doe','Today, 09:20 AM','Ready'],
        ['Cash flow statement','Finance','John Doe','May 30, 2026','Ready'],
        ['Overdue receivables','Finance','Sarah Miller','May 29, 2026','Ready']
      ]}
    }
  },
  Inventory: {
    eyebrow: 'Materials & stock', title: 'Inventory', action: 'Add item',
    stats: [['Stock value','$48,750','+6.3%'],['Total items','156','+8'],['Low stock','12','+3'],['Waste this month','$1,240','-8.5%']],
    tabs: {
      Overview: { columns: ['Item','Category','Location','Available','Status'], rows: [
        ['Vinyl Roll 1.52m','Printing','Main warehouse','5 m','Low'],
        ['UV Ink Cyan','Ink','Production A','2 L','Low'],
        ['Lamination Gloss','Lamination','Main warehouse','3 m','Low'],
        ['DTF Film 60cm','DTF','Production B','15 m','In stock'],
        ['PVC Board 3mm','Material','Main warehouse','25 pcs','In stock']
      ]},
      Items: { columns: ['Item','Category','Unit','Cost','Status'], rows: [
        ['Cleaning solution','Consumables','Bottle','$6.50','In stock'],
        ['Cutting blades — 45°','Tools','Pack','$18.00','In stock'],
        ['Safety gloves','Consumables','Box','$12.00','Low'],
        ['Printer nozzle set','Spare parts','Set','$85.00','In stock']
      ]},
      Rolls: { columns: ['Roll ID','Material','Width','Remaining','Status'], rows: [
        ['VIN-2026-004','Printable vinyl','1.52 m','31.5 m','In stock'],
        ['BAN-2026-011','Banner material','1.52 m','8.2 m','Low'],
        ['LAM-2026-009','Lamination film','1.52 m','12.0 m','In stock'],
        ['ONE-2026-002','One-way vision','1.37 m','22.4 m','In stock']
      ]},
      Sheets: { columns: ['Sheet ID','Material','Dimensions','Remaining','Status'], rows: [
        ['PVC-2026-018','PVC Board 3mm','2440×1220mm','25 pcs','In stock'],
        ['ACR-2026-006','Acrylic 5mm','2440×1220mm','6 pcs','Low'],
        ['FOR-2026-014','Forex 5mm','3050×1220mm','14 pcs','In stock']
      ]},
      Movements: { columns: ['Movement','Item','Type','Quantity','Status'], rows: [
        ['MV-2026-0392','Vinyl Roll 1.52m','Issue','18.5 m','Completed'],
        ['MV-2026-0391','PVC Board 3mm','Purchase receipt','+50 pcs','Completed'],
        ['MV-2026-0390','UV Ink Cyan','Adjustment','-0.4 L','Completed'],
        ['MV-2026-0389','DTF Film 60cm','Transfer','10 m','Completed']
      ]},
      'Material usage': { columns: ['Job','Material','Quantity used','Cost','Status'], rows: [
        ['WO-2026-0182','Banner material','9.2 m','$110.40','Recorded'],
        ['WO-2026-0179','Printable vinyl','14.0 m','$168.00','Recorded'],
        ['WO-2026-0176','DTF Film 60cm','32.0 m','$288.00','Recorded']
      ]},
      Waste: { columns: ['Material','Reason','Quantity','Reported by','Status'], rows: [
        ['Printable vinyl','Printing error','2.1 m','David Brown','Approved'],
        ['UV Ink Magenta','Machine issue','0.3 L','David Brown','Pending approval'],
        ['Lamination Gloss','Incorrect dimensions','1.4 m','Emma Wilson','Approved']
      ]},
      'Low stock': { columns: ['Item','Current','Minimum','Reorder point','Status'], rows: [
        ['Vinyl Roll 1.52m','5 m','10 m','15 m','Low'],
        ['UV Ink Cyan','2 L','5 L','8 L','Low'],
        ['Lamination Gloss','3 m','8 m','12 m','Low'],
        ['Safety gloves','4 boxes','10 boxes','15 boxes','Low']
      ]}
    }
  },
  HR: {
    eyebrow: 'People operations', title: 'Human Resources', action: 'Add employee',
    stats: [['Employees','50','+4'],['Active today','42','84%'],['On leave','3','6%'],['Open positions','5','+2']],
    tabs: {
      Employees: { columns: ['Employee','Department','Position','Branch','Status'], rows: [
        ['Sarah Miller','Sales','Sales Manager','New York','Active'],
        ['Michael Chen','Development','Lead Developer','New York','Active'],
        ['Mariam Diallo','Operations','Branch Manager','Conakry','Active'],
        ['David Brown','Production','Production Lead','New York','On leave'],
        ['Emma Wilson','Design','Senior Designer','New York','Active']
      ]},
      Departments: { columns: ['Department','Manager','Headcount','Budget','Status'], rows: [
        ['Sales','Sarah Miller','8','$420,000','Active'],
        ['Development','Michael Chen','12','$680,000','Active'],
        ['Production','David Brown','14','$510,000','Active'],
        ['Design','Emma Wilson','6','$310,000','Active'],
        ['Operations — Conakry','Mariam Diallo','10','$240,000','Active']
      ]},
      Leave: { columns: ['Employee','Leave type','Dates','Days','Status'], rows: [
        ['David Brown','Annual leave','Jun 01 – Jun 05','5','Approved'],
        ['Emma Wilson','Sick leave','May 30','1','Approved'],
        ['Robert King','Annual leave','Jun 10 – Jun 14','5','Pending approval'],
        ['Ibrahim Camara','Unpaid leave','Jun 03 – Jun 04','2','Pending approval']
      ]},
      Performance: { columns: ['Employee','Review period','Reviewer','Score','Status'], rows: [
        ['Sarah Miller','Q1 2026','John Doe','4.6 / 5','Completed'],
        ['Michael Chen','Q1 2026','John Doe','4.8 / 5','Completed'],
        ['David Brown','Q1 2026','John Doe','4.1 / 5','Completed'],
        ['Emma Wilson','Q2 2026','John Doe','—','Scheduled']
      ]},
      Documents: { columns: ['Document','Employee','Category','Uploaded','Status'], rows: [
        ['Employment contract','Sarah Miller','Contract','Jan 14, 2024','On file'],
        ['ID copy','Michael Chen','Identification','Mar 02, 2023','On file'],
        ['Work permit','Mariam Diallo','Legal','Feb 18, 2025','On file'],
        ['Bank details form','David Brown','Payroll','Jan 20, 2022','On file']
      ]}
    }
  },
  Payroll: {
    eyebrow: 'Compensation', title: 'Payroll', action: 'Run payroll',
    stats: [['Current payroll','$56,780','+3.2%'],['Employees paid','45 / 50','90%'],['Pending approval','5','-3'],['Deductions','$4,820','+1.1%']],
    tabs: {
      Dashboard: { columns: ['Period','Employees','Gross pay','Net pay','Status'], rows: [
        ['May 2026','50','$61,600','$56,780','Processing'],
        ['April 2026','48','$58,900','$54,120','Paid'],
        ['March 2026','47','$57,200','$52,640','Paid']
      ]},
      'Payroll periods': { columns: ['Period','Start','End','Employees','Status'], rows: [
        ['May 2026','May 01, 2026','May 31, 2026','50','Open'],
        ['April 2026','Apr 01, 2026','Apr 30, 2026','48','Locked'],
        ['March 2026','Mar 01, 2026','Mar 31, 2026','47','Locked']
      ]},
      'Payroll run': { columns: ['Employee','Gross pay','Deductions','Net pay','Status'], rows: [
        ['Sarah Miller','$5,800','$740','$5,060','Paid'],
        ['Michael Chen','$6,750','$920','$5,830','Paid'],
        ['Mariam Diallo','$4,900','$610','$4,290','Approved'],
        ['David Brown','$5,200','$680','$4,520','Pending'],
        ['Emma Wilson','$5,400','$695','$4,705','Paid']
      ]},
      Approvals: { columns: ['Payroll run','Submitted by','Total','Submitted','Status'], rows: [
        ['May 2026','John Doe','$56,780','May 30, 2026','Pending approval'],
        ['April 2026','John Doe','$54,120','Apr 29, 2026','Approved']
      ]},
      Payslips: { columns: ['Employee','Period','Net pay','Issued','Status'], rows: [
        ['Sarah Miller','April 2026','$5,010','May 01, 2026','Delivered'],
        ['Michael Chen','April 2026','$5,780','May 01, 2026','Delivered'],
        ['David Brown','April 2026','$4,480','May 01, 2026','Delivered']
      ]},
      Loans: { columns: ['Employee','Loan amount','Balance','Monthly deduction','Status'], rows: [
        ['Ibrahim Camara','$1,200','$400','$100','Active'],
        ['Robert King','$800','$800','$80','Requested']
      ]},
      Advances: { columns: ['Employee','Amount','Requested','Approved by','Status'], rows: [
        ['Emma Wilson','$500','May 20, 2026','John Doe','Approved'],
        ['James Wilson','$300','May 26, 2026','—','Pending approval']
      ]},
      Reimbursements: { columns: ['Employee','Expense','Amount','Submitted','Status'], rows: [
        ['Michael Chen','Client site travel','$140','May 22, 2026','Approved'],
        ['Mariam Diallo','Office supplies','$62','May 24, 2026','Pending approval']
      ]}
    }
  },
  Attendance: {
    eyebrow: 'Time & presence', title: 'Attendance', action: 'Add record',
    stats: [['Checked in','42','84%'],['Late arrivals','2','-3'],['Absent','6','+1'],['Avg. work time','7h 42m','+12m']],
    tabs: {
      Today: { columns: ['Employee','Check in','Check out','Hours','Status'], rows: [
        ['Sarah Miller','08:02 AM','05:06 PM','8h 04m','Present'],
        ['Michael Chen','08:11 AM','—','6h 49m','Present'],
        ['Mariam Diallo','07:58 AM','04:51 PM','7h 53m','Present'],
        ['David Brown','—','—','0h','Absent'],
        ['Emma Wilson','08:34 AM','—','6h 26m','Late']
      ]},
      Timesheets: { columns: ['Employee','Week','Regular hrs','Overtime','Status'], rows: [
        ['Sarah Miller','May 25 – 31','40h','2h','Submitted'],
        ['Michael Chen','May 25 – 31','38h','5h','Submitted'],
        ['Mariam Diallo','May 25 – 31','40h','0h','Approved']
      ]},
      Schedules: { columns: ['Employee','Shift','Days','Location','Status'], rows: [
        ['Sarah Miller','09:00 – 17:00','Mon – Fri','New York','Active'],
        ['James Wilson','20:00 – 06:00','Mon – Sat','Main Office','Active'],
        ['Mariam Diallo','08:00 – 16:00','Mon – Fri','Conakry','Active']
      ]},
      Adjustments: { columns: ['Employee','Date','Reason','Adjusted by','Status'], rows: [
        ['Emma Wilson','May 30, 2026','Forgot to check out','John Doe','Approved'],
        ['David Brown','May 29, 2026','System outage','John Doe','Approved']
      ]},
      'Attendance map': { columns: ['Employee','Location','Distance from site','Last ping','Status'], rows: [
        ['James Wilson','Main Office','12 m','2 min ago','Inside geofence'],
        ['Ibrahim Camara','Warehouse','8 m','5 min ago','Inside geofence'],
        ['Robert King','BuildTech Site','340 m','11 min ago','Outside geofence']
      ]}
    }
  },
  Security: {
    eyebrow: 'Field workforce', title: 'Security Operations', action: 'Report incident',
    stats: [['Guards on duty','18','90%'],['Active patrols','6','+1'],['Missed checkpoints','2','-4'],['Open incidents','3','+1']],
    tabs: {
      'Guard dashboard': { columns: ['Guard / Event','Site','Last update','Assignment','Status'], rows: [
        ['James Wilson','Main Office','2 min ago','North entrance','On duty'],
        ['Ibrahim Camara','Warehouse','5 min ago','Patrol route A','On patrol'],
        ['Robert King','BuildTech Site','11 min ago','West gate','On duty'],
        ['Checkpoint #08','Main Office','18 min ago','Route B','Missed'],
        ['Visitor #V-1082','Main Office','24 min ago','Reception','Checked in']
      ]},
      Shifts: { columns: ['Guard','Shift','Site','Hours','Status'], rows: [
        ['James Wilson','Night','Main Office','20:00 – 06:00','Active'],
        ['Ibrahim Camara','Day','Warehouse','06:00 – 18:00','Active'],
        ['Robert King','Night','BuildTech Site','18:00 – 06:00','Active']
      ]},
      Geofences: { columns: ['Geofence','Site','Radius','Guards assigned','Status'], rows: [
        ['Main Office Perimeter','Main Office','150 m','4','Active'],
        ['Warehouse Zone','Warehouse','200 m','2','Active'],
        ['BuildTech Site Boundary','BuildTech Site','120 m','2','Active']
      ]},
      'Patrol routes': { columns: ['Route','Site','Checkpoints','Avg. duration','Status'], rows: [
        ['Route A — Perimeter','Main Office','6','18 min','Active'],
        ['Route B — Warehouse','Warehouse','4','12 min','Active'],
        ['Route C — Interior','Main Office','5','15 min','Active']
      ]},
      'Live patrols': { columns: ['Guard','Route','Progress','Started','Status'], rows: [
        ['Ibrahim Camara','Route A — Perimeter','4 / 6 checkpoints','25 min ago','On patrol'],
        ['James Wilson','Route C — Interior','2 / 5 checkpoints','10 min ago','On patrol']
      ]},
      Checkpoints: { columns: ['Checkpoint','Route','Last scan','Guard','Status'], rows: [
        ['Front Gate','Route A','2 min ago','Ibrahim Camara','Scanned'],
        ['Parking Area','Route A','9 min ago','Ibrahim Camara','Scanned'],
        ['Server Room','Route C','18 min ago','James Wilson','Missed']
      ]},
      Incidents: { columns: ['Incident','Site','Reported by','Priority','Status'], rows: [
        ['Unauthorized access attempt','Main Office','James Wilson','High','Open'],
        ['Damaged fence panel','Warehouse','Ibrahim Camara','Medium','Open'],
        ['Suspicious vehicle','BuildTech Site','Robert King','Medium','Resolved']
      ]},
      Visitors: { columns: ['Visitor','Host','Company','Entry time','Status'], rows: [
        ['Amelia Grant','Sarah Miller','BuildTech LLC','09:14 AM','Checked in'],
        ['Liam Harris','David Brown','Northstar Co.','10:02 AM','Checked out'],
        ['Sophia Turner','Michael Chen','Apex Retail','11:20 AM','Checked in']
      ]}
    }
  },
  Assets: {
    eyebrow: 'Company resources', title: 'Assets', action: 'Register asset',
    stats: [['Total assets','284','+12'],['Assigned','231','81.3%'],['Maintenance due','14','+3'],['Asset value','$326,400','+4.7%']],
    tabs: {
      'All assets': { columns: ['Asset','Category','Assigned to','Location','Status'], rows: [
        ['MacBook Pro 14”','Computer','Michael Chen','New York','Assigned'],
        ['Epson SureColor S80600','Printer','Production Team','Main Office','Operational'],
        ['Toyota Hilux GN-042','Vehicle','Ibrahim Camara','Conakry','Assigned'],
        ['Canon EOS R6','Camera','Marketing Team','New York','Maintenance'],
        ['Dell PowerEdge R750','Server','IT Department','Data center','Operational']
      ]},
      Assignments: { columns: ['Asset','Assigned to','Branch','Since','Status'], rows: [
        ['MacBook Pro 14”','Michael Chen','New York','Mar 02, 2024','Assigned'],
        ['Toyota Hilux GN-042','Ibrahim Camara','Conakry','Jan 14, 2023','Assigned'],
        ['iPhone 15','Sarah Miller','New York','Jun 10, 2025','Assigned']
      ]},
      Maintenance: { columns: ['Asset','Type','Scheduled','Cost','Status'], rows: [
        ['Canon EOS R6','Sensor cleaning','May 29, 2026','$80','In progress'],
        ['Epson SureColor S80600','Head alignment','Jun 05, 2026','$150','Scheduled'],
        ['Toyota Hilux GN-042','Oil change','Jun 12, 2026','$60','Scheduled']
      ]},
      Categories: { columns: ['Category','Assets','Total value','Avg. age','Status'], rows: [
        ['Computers','48','$62,400','2.1 yrs','Tracked'],
        ['Vehicles','9','$186,000','3.4 yrs','Tracked'],
        ['Printers','14','$48,600','1.8 yrs','Tracked'],
        ['Cameras','6','$14,200','1.2 yrs','Tracked']
      ]}
    }
  },
  'Work Orders': {
    eyebrow: 'Execution workflow', title: 'Work Orders', action: 'Create work order',
    stats: [['Open orders','36','+7'],['In production','14','+3'],['Due this week','9','-2'],['Completion rate','91.2%','+4.6%']],
    tabs: {
      'All work orders': { columns: ['Work order','Customer','Assigned team','Due date','Status'], rows: [
        ['WO-2026-0184','ABC Construction','Web Team','Jun 08, 2026','In progress'],
        ['WO-2026-0183','BuildTech LLC','Mobile Team','Jun 12, 2026','Assigned'],
        ['WO-2026-0182','Luma Studio','Print Team','Jun 05, 2026','Quality control'],
        ['WO-2026-0181','Northstar Co.','Installation','Jun 03, 2026','Ready'],
        ['WO-2026-0180','Apex Retail','Production B','May 31, 2026','Completed']
      ]},
      'Production queue': { columns: ['Work order','Priority','Machine','Est. completion','Status'], rows: [
        ['WO-2026-0182','High','Epson S80600','Today, 4:00 PM','In progress'],
        ['WO-2026-0179','Medium','Print Team B','Today, 6:30 PM','In progress'],
        ['WO-2026-0178','Medium','CNC Router','Jun 02, 2026','Queued']
      ]},
      'Quality control': { columns: ['Work order','Inspector','Checked','Result','Status'], rows: [
        ['WO-2026-0182','Emma Wilson','Today, 1:10 PM','Pass','Approved'],
        ['WO-2026-0176','David Brown','May 30, 2026','Rework needed','Rejected']
      ]},
      Deliveries: { columns: ['Work order','Customer','Method','Scheduled','Status'], rows: [
        ['WO-2026-0180','Apex Retail','Courier','May 31, 2026','Delivered'],
        ['WO-2026-0181','Northstar Co.','Self pickup','Jun 03, 2026','Scheduled'],
        ['WO-2026-0177','ABC Construction','Installation crew','Jun 01, 2026','Scheduled']
      ]},
      Calendar: { columns: ['Work order','Customer','Date','Time','Status'], rows: [
        ['WO-2026-0181','Northstar Co.','Jun 03, 2026','09:00 AM','Scheduled'],
        ['WO-2026-0184','ABC Construction','Jun 08, 2026','02:00 PM','Scheduled']
      ]}
    }
  },
  Production: {
    eyebrow: 'Operations floor', title: 'Production', action: 'Add production job',
    stats: [['Jobs in queue','18','+4'],['In production','7','+1'],['Completed today','12','+20%'],['Efficiency','92.4%','+3.7%']],
    tabs: {
      Queue: { columns: ['Job','Work order','Machine / Team','Deadline','Status'], rows: [
        ['Banner Set — Main Office','WO-2026-0182','Epson S80600','Today, 2:00 PM','In progress'],
        ['Vehicle Wrap — Hilux','WO-2026-0179','Print Team B','Today, 5:00 PM','Quality control'],
        ['Building Signage','WO-2026-0178','CNC Router','Jun 02, 2026','Ready'],
        ['Staff Uniforms × 120','WO-2026-0176','DTF Station','Jun 04, 2026','Waiting for materials'],
        ['Annual Reports × 500','WO-2026-0172','Production A','May 31, 2026','Completed']
      ]},
      Schedule: { columns: ['Job','Machine','Start','End','Status'], rows: [
        ['Banner Set — Main Office','Epson S80600','Today, 10:00 AM','Today, 2:00 PM','In progress'],
        ['Building Signage','CNC Router','Jun 02, 08:00 AM','Jun 02, 12:00 PM','Scheduled']
      ]},
      Machines: { columns: ['Machine','Type','Utilization','Next maintenance','Status'], rows: [
        ['Epson SureColor S80600','Large-format printer','82%','Jun 05, 2026','Operational'],
        ['CNC Router','Cutting','61%','Jun 20, 2026','Operational'],
        ['DTF Station','Printer','74%','Jun 12, 2026','Operational']
      ]},
      'Quality control': { columns: ['Job','Inspector','Defects','Result','Status'], rows: [
        ['Vehicle Wrap — Hilux','Emma Wilson','0','Pass','In progress'],
        ['Annual Reports × 500','David Brown','2 misprints','Reworked','Completed']
      ]},
      'Material usage': { columns: ['Job','Material','Quantity','Cost','Status'], rows: [
        ['Banner Set — Main Office','Banner material','9.2 m','$110.40','Recorded'],
        ['Vehicle Wrap — Hilux','Printable vinyl','14.0 m','$168.00','Recorded']
      ]},
      Waste: { columns: ['Job','Material','Quantity','Reason','Status'], rows: [
        ['Annual Reports × 500','Paper','12 sheets','Printing error','Approved'],
        ['Banner Set — Main Office','Banner material','0.4 m','Incorrect dimensions','Pending approval']
      ]}
    }
  },
  Procurement: {
    eyebrow: 'Purchasing & suppliers', title: 'Procurement', action: 'New purchase request',
    stats: [['Open requests','12','+3'],['Open orders','$42,680','+8.2%'],['Awaiting delivery','8','-2'],['Active suppliers','34','+4']],
    tabs: {
      Suppliers: { columns: ['Supplier','Category','Contact','Rating','Status'], rows: [
        ['PrintSupply USA','Printing materials','sales@printsupply.com','4.6 / 5','Active'],
        ['Ink & Media Co.','Ink & media','orders@inkmedia.com','4.2 / 5','Active'],
        ['TechSource Inc.','Technology','info@techsource.com','4.8 / 5','Active'],
        ['Global Materials','Raw materials','contact@globalmat.com','4.0 / 5','Active']
      ]},
      'Purchase requests': { columns: ['Request','Requested by','Items','Amount','Status'], rows: [
        ['PR-2026-0062','Emma Wilson','Ink & media','$3,280','Pending approval'],
        ['PR-2026-0061','Sarah Miller','Office supplies','$1,280','Draft'],
        ['PR-2026-0060','David Brown','Printing materials','$5,600','Approved']
      ]},
      'Purchase orders': { columns: ['Reference','Supplier','Requested by','Total','Status'], rows: [
        ['PO-2026-0048','PrintSupply USA','David Brown','$8,450','Approved'],
        ['PO-2026-0047','TechSource Inc.','Michael Chen','$12,900','Awaiting delivery'],
        ['PO-2026-0046','Global Materials','Mariam Diallo','$6,740','Sent']
      ]},
      Receiving: { columns: ['Receipt','PO','Supplier','Received','Status'], rows: [
        ['GR-2026-0031','PO-2026-0044','Global Materials','May 28, 2026','Received'],
        ['GR-2026-0030','PO-2026-0042','PrintSupply USA','May 24, 2026','Partially received']
      ]},
      'Supplier payments': { columns: ['Payment','Supplier','Amount','Due date','Status'], rows: [
        ['SP-2026-0021','PrintSupply USA','$8,450','Jun 10, 2026','Scheduled'],
        ['SP-2026-0020','Ink & Media Co.','$3,280','Jun 05, 2026','Pending approval'],
        ['SP-2026-0019','Global Materials','$6,740','May 29, 2026','Paid']
      ]}
    }
  },
  'Customer Portal': {
    eyebrow: 'Customer self-service', title: 'Customer Portal', action: 'Invite customer',
    stats: [['Portal users','486','+22'],['Active this month','312','64.2%'],['Pending approvals','14','-5'],['Open tickets','8','-3']],
    tabs: {
      'Portal users': { columns: ['Customer','Portal contact','Last active','Open items','Status'], rows: [
        ['ABC Construction','James Wilson','2 hours ago','3','Active'],
        ['BuildTech LLC','Amelia Grant','Yesterday','2','Active'],
        ['Luma Studio','Olivia Moore','May 29, 2026','1','Active'],
        ['Northstar Co.','Liam Harris','May 26, 2026','4','Invited'],
        ['Apex Retail','Sophia Turner','Never','0','Invitation pending']
      ]},
      Quotations: { columns: ['Quotation','Customer','Sent','Amount','Status'], rows: [
        ['QUO-2026-0041','ABC Construction','May 31, 2026','$18,500','Accepted'],
        ['QUO-2026-0039','Luma Studio','May 28, 2026','$8,400','Viewed']
      ]},
      Contracts: { columns: ['Contract','Customer','Sent','Value','Status'], rows: [
        ['CTR-2026-0014','ABC Construction','May 25, 2026','$24,000','Customer signed'],
        ['CTR-2026-0013','Luma Studio','May 26, 2026','$9,800','Awaiting signature']
      ]},
      Projects: { columns: ['Project','Customer','Progress','Updated','Status'], rows: [
        ['Website Redesign','ABC Construction','62%','Today','In progress'],
        ['Brand Identity','Luma Studio','48%','Yesterday','Under review']
      ]},
      Invoices: { columns: ['Invoice','Customer','Amount','Due','Status'], rows: [
        ['INV-2026-0084','ABC Construction','$12,450','Paid','Paid'],
        ['INV-2026-0082','Luma Studio','$6,250','May 20, 2026','Overdue']
      ]},
      Payments: { columns: ['Payment','Customer','Method','Amount','Status'], rows: [
        ['PMT-2026-0112','ABC Construction','Bank transfer','$12,450','Verified']
      ]},
      Files: { columns: ['File','Customer','Shared by','Date','Status'], rows: [
        ['homepage-mockup-v3.fig','ABC Construction','Emma Wilson','Jun 01, 2026','Shared'],
        ['brand-guidelines-final.pdf','Luma Studio','Emma Wilson','May 30, 2026','Shared']
      ]},
      Messages: { columns: ['Thread','Customer','Last message','Updated','Status'], rows: [
        ['Website feedback','ABC Construction','"Looks great, one small tweak..."','2 hours ago','Unread'],
        ['Invoice question','Luma Studio','"Can you resend the receipt?"','Yesterday','Read']
      ]},
      Support: { columns: ['Ticket','Customer','Priority','Opened','Status'], rows: [
        ['TCK-2026-0102','Northstar Co.','Medium','May 29, 2026','Open'],
        ['TCK-2026-0101','Apex Retail','Low','May 24, 2026','Resolved']
      ]}
    }
  },
  Notifications: {
    eyebrow: 'Communication center', title: 'Notifications', action: 'New notification',
    stats: [['Sent this month','2,840','+16%'],['Delivery rate','98.4%','+0.8%'],['Open rate','72.6%','+5.3%'],['Failed','14','-18%']],
    tabs: {
      'All notifications': { columns: ['Notification','Channel','Recipient','Sent at','Status'], rows: [
        ['Payment receipt RCP-0048','Email','ABC Construction','10 min ago','Delivered'],
        ['Contract signature reminder','WhatsApp','BuildTech LLC','1 hour ago','Read'],
        ['Project update available','In-app','Luma Studio','3 hours ago','Delivered'],
        ['Invoice INV-2026-0082 overdue','SMS','Northstar Co.','Yesterday','Delivered'],
        ['Quotation QUO-2026-0040','Email','Apex Retail','May 30, 2026','Failed']
      ]},
      Templates: { columns: ['Template','Event','Channel','Updated','Status'], rows: [
        ['Quotation sent','quotation.sent','Email','May 12, 2026','Active'],
        ['Payment verified','payment.verified','Email + SMS','May 10, 2026','Active'],
        ['Contract signature reminder','contract.signature_reminder','WhatsApp','May 08, 2026','Active']
      ]},
      'Delivery history': { columns: ['Notification','Recipient','Channel','Sent','Status'], rows: [
        ['Payment receipt RCP-0048','ABC Construction','Email','10 min ago','Delivered'],
        ['Quotation QUO-2026-0040','Apex Retail','Email','May 30, 2026','Failed']
      ]},
      Preferences: { columns: ['User','Email','SMS','Push','Status'], rows: [
        ['ABC Construction','On','On','Off','Configured'],
        ['BuildTech LLC','On','Off','On','Configured']
      ]},
      Channels: { columns: ['Channel','Provider','Sent this month','Failure rate','Status'], rows: [
        ['Email','Resend','1,840','0.6%','Healthy'],
        ['SMS','Twilio','420','1.2%','Healthy'],
        ['WhatsApp','Meta Cloud API','580','0.3%','Healthy']
      ]}
    }
  },
  'Platform Admin': {
    eyebrow: 'SaaS control center', title: 'Platform Administration', action: 'Add organization',
    stats: [['Organizations','128','+9'],['Active subscriptions','116','+7'],['Monthly recurring','$42,860','+12.4%'],['System uptime','99.99%','Healthy']],
    tabs: {
      Overview: { columns: ['Organization','Plan','Users','Renewal','Status'], rows: [
        ['Global High Tech LLC','Internal','64','—','Active'],
        ['ABC Construction','Business','28','Jun 18, 2026','Active'],
        ['BuildTech LLC','Enterprise','86','Jul 02, 2026','Active'],
        ['Luma Studio','Starter','12','Jun 12, 2026','Trial'],
        ['Northstar Co.','Business','42','Jun 25, 2026','Active']
      ]},
      Organizations: { columns: ['Organization','Country','Users','Plan','Status'], rows: [
        ['Global High Tech LLC','US / GN','64','Internal','Active'],
        ['ABC Construction','US','28','Business','Active'],
        ['Luma Studio','US','12','Starter','Trial']
      ]},
      Subscriptions: { columns: ['Organization','Plan','MRR','Renewal','Status'], rows: [
        ['BuildTech LLC','Enterprise','$1,240','Jul 02, 2026','Active'],
        ['ABC Construction','Business','$480','Jun 18, 2026','Active'],
        ['Luma Studio','Starter','$0','Jun 12, 2026','Trial']
      ]},
      Plans: { columns: ['Plan','Price','Orgs on plan','Limits','Status'], rows: [
        ['Starter','$49 / mo','34','3 users, 1 branch','Active'],
        ['Professional','$149 / mo','48','20 users, 5 branches','Active'],
        ['Business','$399 / mo','31','Custom','Active'],
        ['Enterprise','Custom','9','Unlimited','Active']
      ]},
      Modules: { columns: ['Module','Orgs enabled','Category','Version','Status'], rows: [
        ['CRM','124','Core','1.4','Enabled'],
        ['Payroll','52','HR','1.2','Enabled'],
        ['Security','18','Field ops','1.1','Enabled']
      ]},
      'Support access': { columns: ['Organization','Requested by','Reason','Expires','Status'], rows: [
        ['BuildTech LLC','Support Admin','Invoice discrepancy investigation','In 2 hours','Active'],
        ['Luma Studio','Support Admin','Onboarding assistance','Expired','Expired']
      ]},
      'System health': { columns: ['Service','Region','Latency','Uptime','Status'], rows: [
        ['API','us-east','48ms','99.99%','Healthy'],
        ['Database','us-east','6ms','99.99%','Healthy'],
        ['Queue workers','us-east','—','99.95%','Healthy']
      ]},
      'Security events': { columns: ['Event','Organization','User','Time','Status'], rows: [
        ['Failed login × 3','Northstar Co.','liam.harris@northstar.com','12 min ago','Flagged'],
        ['Permission change','BuildTech LLC','John Doe','1 hour ago','Reviewed']
      ]}
    }
  },
  Reports: {
    eyebrow: 'Business intelligence', title: 'Reports & Analytics', action: 'Create report',
    stats: [['Reports generated','128','+22%'],['Scheduled reports','12','+2'],['Exports this month','47','+18%'],['Data sources','14','+1']],
    tabs: {
      Dashboard: { columns: ['Report','Category','Owner','Last generated','Status'], rows: [
        ['Monthly financial summary','Finance','John Doe','Today, 09:20 AM','Ready'],
        ['Inventory movement report','Inventory','David Brown','Yesterday','Ready'],
        ['Employee attendance','HR','Mariam Diallo','May 30, 2026','Scheduled'],
        ['Project profitability','Projects','Sarah Miller','May 28, 2026','Ready'],
        ['Branch performance','Executive','John Doe','May 25, 2026','Draft']
      ]},
      'Report builder': { columns: ['Draft report','Category','Fields','Last edited','Status'], rows: [
        ['Q2 sales by rep','Sales','8 fields','Today','Draft'],
        ['Material waste by branch','Inventory','5 fields','Yesterday','Draft']
      ]},
      'Saved reports': { columns: ['Report','Owner','Schedule','Last run','Status'], rows: [
        ['Monthly financial summary','John Doe','Monthly','Today','Ready'],
        ['Weekly attendance','Mariam Diallo','Weekly','May 26, 2026','Ready']
      ]},
      'Export center': { columns: ['Export','Format','Requested by','Size','Status'], rows: [
        ['Customer balances — May','CSV','Sarah Miller','48 KB','Ready'],
        ['Payroll summary — April','PDF','John Doe','210 KB','Ready']
      ]}
    }
  },
  Settings: {
    eyebrow: 'Workspace configuration', title: 'Settings', action: 'Save changes',
    stats: [['Active users','64','+5'],['Branches','2',''],['Enabled modules','14',''],['Security score','96%','Excellent']],
    tabs: {
      Organization: { columns: ['Configuration','Scope','Updated by','Last updated','Status'], rows: [
        ['Organization profile','Global','John Doe','May 31, 2026','Configured'],
        ['New York Office','Branch','Sarah Miller','May 29, 2026','Active'],
        ['Conakry Branch','Branch','Mariam Diallo','May 27, 2026','Active'],
        ['Finance Manager','Role','John Doe','May 25, 2026','12 permissions'],
        ['Invoice template','Documents','Michael Chen','May 24, 2026','Published']
      ]},
      Branches: { columns: ['Branch','Country','Manager','Employees','Status'], rows: [
        ['New York Office','US','Sarah Miller','38','Active'],
        ['Conakry Branch','GN','Mariam Diallo','12','Active']
      ]},
      Users: { columns: ['User','Role','Branch','Last login','Status'], rows: [
        ['John Doe','Company Owner','All branches','Today, 09:02 AM','Active'],
        ['Sarah Miller','Sales Representative','New York','Today, 08:41 AM','Active'],
        ['Mariam Diallo','Branch Manager','Conakry','Yesterday','Active']
      ]},
      Roles: { columns: ['Role','Users','Permissions','Scope','Status'], rows: [
        ['Company Owner','1','189','Organization','Active'],
        ['Finance Manager','2','34','Organization','Active'],
        ['Sales Representative','4','31','Branch','Active']
      ]},
      Permissions: { columns: ['Permission','Module','Roles granted','Sensitive','Status'], rows: [
        ['payments.reverse','Finance','2','Yes','Restricted'],
        ['customers.view','CRM','9','No','Standard']
      ]},
      Modules: { columns: ['Module','Enabled','Plan requirement','Dependencies','Status'], rows: [
        ['CRM','Yes','Starter+','Core','Enabled'],
        ['Payroll','Yes','Business+','HR','Enabled'],
        ['Security','No','Business+','HR, Attendance','Disabled']
      ]},
      Notifications: { columns: ['Setting','Channel','Default','Scope','Status'], rows: [
        ['Payment received','Email + In-app','On','Organization','Configured'],
        ['Low stock alert','In-app','On','Organization','Configured']
      ]},
      Documents: { columns: ['Template','Type','Format','Updated','Status'], rows: [
        ['Invoice template','Invoice','PDF','May 24, 2026','Published'],
        ['Quotation template','Quotation','PDF','May 20, 2026','Published']
      ]},
      'Audit log': { columns: ['Action','User','Entity','Time','Status'], rows: [
        ['Role permissions updated','John Doe','Finance Manager','Today, 10:24 AM','Logged'],
        ['Payment reversed','John Doe','PMT-2026-0098','Yesterday','Logged']
      ]}
    }
  }
};

const kanban = [
  ['Awaiting approval',[['Signage Installation','Northstar Co.'],['CRM Integration','Luma Studio']]],
  ['Ready to start',[['Brand Guidelines','Apex Retail'],['Office Network','ABC Construction']]],
  ['In progress',[['Mobile App Development','BuildTech LLC'],['Website Redesign','ABC Construction'],['Marketing Campaign','Luma Studio']]],
  ['Under review',[['Brand Identity','Luma Studio'],['Annual Report Design','GHT Guinea']]]
];

const resourceModules = {
  CRM:'customers', Sales:'quotations', Projects:'projects', Contracts:'contracts', Finance:'expenses',
  Inventory:'services', HR:'employees', Payroll:'payroll-runs', Security:'incidents',
  Assets:'assets', 'Work Orders':'work-orders', Production:'production-jobs', Procurement:'purchase-orders',
  'Customer Portal':'documents', Notifications:'notifications', Reports:'reports'
};

function recordRow(record, columnCount) {
  const values = Array.isArray(record.data?.values) ? record.data.values : [];
  const row = [record.name, ...values.slice(0, Math.max(0, columnCount - 2)), record.status.replaceAll('_',' ')];
  while (row.length < columnCount) row.splice(row.length - 1, 0, '—');
  row._record = record;
  return row;
}

/** "Inside Main Office · 12 m" / "Outside Main Office · 340 m" / "No geofence set". */
function locationSummary(fix) {
  if (!fix) return '—';
  if (fix.inside === null || fix.distanceMeters === null) return 'No geofence set';
  return `${fix.inside ? 'Inside' : 'Outside'}${fix.site ? ` ${fix.site}` : ''} · ${fix.distanceMeters} m`;
}

function attendanceRow(record) {
  const checkIn = record.data?.checkIn?.capturedAt ? new Date(record.data.checkIn.capturedAt) : null;
  const checkOut = record.data?.checkOut?.capturedAt ? new Date(record.data.checkOut.capturedAt) : null;
  const minutes = Number(record.data?.durationMinutes ?? (checkIn && !checkOut ? Math.max(0, Math.round((Date.now()-checkIn.getTime())/60000)) : 0));
  const hours = `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}m`;
  const status = record.status === 'PENDING' ? 'Needs review' : record.status === 'COMPLETED' ? 'Completed' : 'Present';
  const row = [record.employeeName ?? 'Unknown employee', checkIn ? checkIn.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—', checkOut ? checkOut.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—', hours, locationSummary(record.location?.checkIn), status];
  row._record = record;
  return row;
}

function Badge({children}){const key=String(children).toLowerCase().replaceAll(' ','-');return <span className={`module-status s-${key}`}>{children}</span>}

function CreateModal({config,onClose,onCreate,busy=false}){
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="create-modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><div><span>{config.eyebrow}</span><h2>{config.action}</h2></div><button onClick={onClose}><X size={19}/></button></div>
    <form onSubmit={e=>{e.preventDefault();onCreate(new FormData(e.currentTarget))}}><label>Name / title<input name="name" required placeholder={`Enter ${config.action.toLowerCase()} name`}/></label><div className="form-row"><label>Reference number<input name="number" placeholder="Generated if blank"/></label><label>Status<select name="status"><option>Draft</option><option>Active</option><option>Pending approval</option></select></label></div><label>Description<textarea name="description" rows="4" placeholder="Add useful details or internal notes..."/></label><div className="upload-zone"><Upload size={20}/><b>Documents can be added after creation</b><span>Create the record first, then open its detail panel.</span></div><div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={busy}>{busy?'Saving…':config.action}</button></div></form>
  </div></div>
}

// The eight values RecordStatus accepts, paired with a readable label.
const recordStatuses = [
  ['DRAFT','Draft'],['PENDING','Pending'],['APPROVED','Approved'],['ACTIVE','Active'],
  ['IN_PROGRESS','In progress'],['COMPLETED','Completed'],['CANCELLED','Cancelled'],['ARCHIVED','Archived']
];

/** One GPS fix: where the person was, and whether that counts as on site. */
function LocationFix({label,fix}){
  if(!fix)return null;
  const verdict=fix.inside===null?'No geofence set':fix.inside?'Inside geofence':'Outside geofence';
  return <div className="gps-fix">
    <div className="gps-head"><b>{label}</b><Badge>{verdict}</Badge></div>
    {fix.site&&<div className="detail-line"><span>Site</span><b>{fix.site}</b></div>}
    {fix.distanceMeters!==null&&<div className="detail-line"><span>Distance from site</span><b>{fix.distanceMeters} m{fix.radiusMeters?` (allowed ${fix.radiusMeters} m)`:''}</b></div>}
    <div className="detail-line"><span>Coordinates</span><b>{fix.latitude.toFixed(6)}, {fix.longitude.toFixed(6)}</b></div>
    {fix.accuracyMeters!==null&&<div className="detail-line"><span>GPS accuracy</span><b>±{fix.accuracyMeters} m</b></div>}
    {fix.capturedAt&&<div className="detail-line"><span>Captured</span><b>{new Date(fix.capturedAt).toLocaleString()}</b></div>}
    <a className="map-link" href={`https://www.openstreetmap.org/?mlat=${fix.latitude}&mlon=${fix.longitude}#map=18/${fix.latitude}/${fix.longitude}`} target="_blank" rel="noreferrer"><MapPin size={13}/> View this position on a map</a>
  </div>;
}

function DetailDrawer({row,columns,onClose,notify,onArchive,onSave,editable=true}){
  // Rows built from the static sample tables carry no `_record`. `editable` is
  // false for Attendance — those are real records, but they are approved rather
  // than edited, so they still display in full here.
  const record=row._record;
  const location=record?.location;
  const [editing,setEditing]=useState(false); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const [form,setForm]=useState({name:'',status:'DRAFT',description:''});
  const startEdit=()=>{
    if(!record){notify('Sample rows are read-only — create a record to edit it.');return}
    if(!editable){notify('Attendance shifts are approved rather than edited.');return}
    setForm({name:record.name,status:record.status,description:record.data?.description??''});
    setError(''); setEditing(true);
  };
  const submit=async e=>{
    e.preventDefault(); setSaving(true); setError('');
    try{
      await onSave(record,{name:form.name.trim(),status:form.status,data:{...(record.data??{}),description:form.description}});
      setEditing(false);
    }catch(err){setError(err.message)}
    finally{setSaving(false)}
  };
  const created=record?.createdAt?new Date(record.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'—';
  const updated=record?.updatedAt?new Date(record.updatedAt).toLocaleString():'—';
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="detail-drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="drawer-head"><div><span>Record details</span><h2>{row[0]}</h2></div><button onClick={onClose}><X/></button></div>
    <div className="drawer-hero"><span>{row[0].slice(0,2).toUpperCase()}</span><div><b>{row[0]}</b><small>{record?`Created ${created} · Updated ${updated}`:'Sample record'}</small></div><Badge>{row[row.length-1]}</Badge></div>
    {editing
      ? <form className="drawer-section drawer-edit" onSubmit={submit}>
          <h3>Edit record</h3>
          <label>Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} maxLength={200} required autoFocus/></label>
          <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{recordStatuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Description<textarea rows="4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Add useful details or internal notes..."/></label>
          {error&&<div className="admin-alert">{error}</div>}
          <div className="drawer-actions"><button type="submit" className="primary" disabled={saving}>{saving?'Saving…':'Save changes'}</button><button type="button" onClick={()=>setEditing(false)} disabled={saving}>Cancel</button></div>
        </form>
      : <>
          <div className="drawer-section"><h3>Information</h3>{columns.map((c,i)=><div className="detail-line" key={c}><span>{c}</span><b>{i===columns.length-1?<Badge>{row[i]}</Badge>:row[i]}</b></div>)}{record?.data?.description&&<div className="detail-line"><span>Description</span><b>{record.data.description}</b></div>}</div>
          {location&&<div className="drawer-section"><h3>Location</h3>
            {record.data?.flagReason&&<div className="admin-alert">{record.data.flagReason}</div>}
            {!location.checkIn&&!location.checkOut&&<p className="drawer-note">No GPS position was captured for this shift.</p>}
            <LocationFix label="Check-in" fix={location.checkIn}/>
            <LocationFix label="Check-out" fix={location.checkOut}/>
            {location.checkIn&&location.checkIn.inside===null&&<p className="drawer-note">No geofence is configured for this branch, so on-site presence cannot be confirmed automatically. Add one under Security › Geofences to verify future check-ins.</p>}
          </div>}
          <div className="drawer-section"><h3>Activity</h3><div className="timeline-item"><i/><div><b>Record updated</b><span>John Doe · Today at 10:24 AM</span></div></div><div className="timeline-item"><i/><div><b>Status changed</b><span>Sarah Miller · Yesterday</span></div></div><div className="timeline-item"><i/><div><b>Record created</b><span>John Doe · May 21, 2026</span></div></div></div>
          <div className="drawer-actions"><button className="primary" onClick={startEdit}><Pencil size={15}/> Edit</button><button onClick={onArchive}><Archive size={15}/> Archive</button></div>
        </>}
  </aside></div>
}

function KanbanView(){return <div className="kanban">{kanban.map(([title,cards],ci)=><div className="kanban-column" key={title}><div className="kanban-title"><span><i className={`dot d${ci}`}/>{title}</span><b>{cards.length}</b></div>{cards.map(([name,client],i)=><article key={name}><div><span>PRJ-{20260+ci*3+i}</span><MoreHorizontal size={16}/></div><h3>{name}</h3><p>{client}</p><div className="kanban-card-foot"><span className="tiny-avatars"><i>SM</i><i>MC</i></span><span><Clock3 size={12}/> Jun {8+ci*4+i}</span></div></article>)}</div>)}</div>}

function PipelineView(){const stages=[['New',18,'$38k'],['Qualified',12,'$61k'],['Proposal sent',9,'$84k'],['Negotiation',6,'$72k'],['Won',14,'$126k']];return <div className="pipeline-view">{stages.map(([n,v,amount],i)=><div key={n}><span>{n}</span><b>{v}</b><i><em style={{height:`${45+v*4}px`}}/></i><strong>{amount}</strong><small>{i===stages.length-1?'31.6% conversion':`${Math.max(20,85-i*13)}% to next stage`}</small></div>)}</div>}

export default function ModuleWorkspace({active,notify}){
  const config=definitions[active] || definitions.CRM;
  const tabNames=useMemo(()=>Object.keys(config.tabs),[config]);
  const [tab,setTab]=useState(tabNames[0]); const [search,setSearch]=useState(''); const [modal,setModal]=useState(false); const [detail,setDetail]=useState(null);
  const [savedRecords,setSavedRecords]=useState([]); const [saving,setSaving]=useState(false); const [loadError,setLoadError]=useState(''); const [liveLoaded,setLiveLoaded]=useState(false);
  // `tab` can briefly reference a tab name from the *previous* module (state
  // updates from the effect below land a render late), so never index
  // config.tabs with the raw state value — fall back to the first tab of the
  // current module whenever the stored name isn't valid here.
  const activeTab=tabNames.includes(tab)?tab:tabNames[0];
  React.useEffect(()=>{setTab(Object.keys(config.tabs)[0]);setSearch('');setDetail(null)},[active]);
  React.useEffect(()=>{setDetail(null)},[activeTab]);
  const tabData=config.tabs[activeTab];
  const isSpecial=typeof tabData==='string';
  const resourceModule=resourceModules[active];
  React.useEffect(()=>{
    let live=true; setSavedRecords([]); setLoadError(''); setLiveLoaded(false);
    if(active==='Attendance'){
      const permissions=sessionStore.get()?.permissions??[];
      const request=permissions.includes('attendance.view')?attendanceApi.list():attendanceApi.mine();
      request.then(result=>{if(live){setSavedRecords(Array.isArray(result)?result:[]);setLiveLoaded(true)}}).catch(err=>{if(live)setLoadError(err.message)});
      return()=>{live=false};
    }
    if(!resourceModule||isSpecial)return()=>{live=false};
    recordsApi.list(resourceModule,'limit=100').then(result=>{if(live){setSavedRecords(result.data||[]);setLiveLoaded(true)}}).catch(err=>{if(live)setLoadError(err.message)});
    return()=>{live=false};
  },[resourceModule,activeTab,isSpecial]);
  // Live attendance rows carry a Location column the static sample tabs don't
  // define, so they bring their own header rather than borrowing the tab's.
  const usingAttendanceRows=active==='Attendance'&&liveLoaded;
  const displayColumns=usingAttendanceRows?['Employee','Check in','Check out','Hours','Location','Status']:isSpecial?[]:tabData.columns;
  const rows=useMemo(()=>{if(isSpecial)return[];const liveRows=savedRecords.map(r=>active==='Attendance'?attendanceRow(r):recordRow(r,tabData.columns.length));const fallback=liveLoaded?[]:tabData.rows;return[...liveRows,...fallback].filter(row=>row.join(' ').toLowerCase().includes(search.toLowerCase()))},[active,tabData,search,isSpecial,savedRecords,liveLoaded]);
  const attendanceOpen=active==='Attendance'?savedRecords.find(record=>['ACTIVE','PENDING'].includes(record.status)&&!record.data?.checkOut):null;
  const displayStats=active==='Attendance'&&liveLoaded?[
    ['Checked in',String(savedRecords.filter(record=>['ACTIVE','PENDING'].includes(record.status)&&!record.data?.checkOut).length),'Live'],
    ['Completed',String(savedRecords.filter(record=>record.status==='COMPLETED').length),'Recorded'],
    ['Needs review',String(savedRecords.filter(record=>record.status==='PENDING').length),'Flagged'],
    ['Total records',String(savedRecords.length),'Current view'],
  ]:config.stats;
  const captureLocation=()=>new Promise((resolve,reject)=>{if(!navigator.geolocation){reject(new Error('Location is not supported by this browser'));return}navigator.geolocation.getCurrentPosition(position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracyMeters:position.coords.accuracy}),()=>reject(new Error('Location permission is required to record attendance')),{enableHighAccuracy:true,timeout:15000,maximumAge:0})});
  const attendanceAction=async()=>{try{setSaving(true);const location=await captureLocation();const record=attendanceOpen?await attendanceApi.checkOut(attendanceOpen.id,location):await attendanceApi.checkIn(location);setSavedRecords(current=>attendanceOpen?current.map(item=>item.id===record.id?{...record,employeeName:item.employeeName}:item):[{...record,employeeName:sessionStore.get()?.user?`${sessionStore.get().user.firstName} ${sessionStore.get().user.lastName}`:'Current user'},...current]);notify(attendanceOpen?'Checked out successfully':'Checked in successfully')}catch(err){notify(err.message)}finally{setSaving(false)}};
  const createRecord=async form=>{try{setSaving(true);const record=await recordsApi.create({module:resourceModule,type:activeTab.toLowerCase().replaceAll(' ','-'),name:form.get('name'),number:form.get('number')||undefined,data:{description:form.get('description'),values:[form.get('number')||'—','Created by you']}});setSavedRecords(current=>[record,...current]);setModal(false);notify(`${config.action} created successfully`)}catch(err){notify(err.message)}finally{setSaving(false)}};
  const archiveRecord=async()=>{if(!detail?._record){notify('Sample records are read-only');return}try{await recordsApi.archive(resourceModule,detail._record.id);setSavedRecords(current=>current.filter(r=>r.id!==detail._record.id));setDetail(null);notify('Record archived')}catch(err){notify(err.message)}};
  // Saves through the API, then refreshes both the table row and the open
  // drawer from the record the server actually stored. Errors propagate so the
  // drawer can show them inline instead of only flashing a toast.
  const saveRecord=async(record,changes)=>{
    const updated=await recordsApi.update(resourceModule,record.id,changes);
    setSavedRecords(current=>current.map(item=>item.id===updated.id?updated:item));
    setDetail(recordRow(updated,tabData.columns.length));
    notify('Record updated');
  };
  return <div className="module-page">
    <div className="module-heading"><div><p>{config.eyebrow}</p><h1>{config.title}</h1><span>Manage, review, and act on your organization’s {config.title.toLowerCase()} data.</span></div><button disabled={saving} onClick={active==='Attendance'?attendanceAction:()=>setModal(true)}>{active==='Attendance'?<Clock3 size={17}/>:<Plus size={17}/>} {saving?'Saving…':active==='Attendance'?(attendanceOpen?'Check out':'Check in'):config.action}</button></div>
    <div className="module-stats">{displayStats.map(([n,v,c],i)=><article key={n}><div><span>{n}</span>{[Users,CircleDollarSign,FolderKanban,CheckCircle2].map((Icon,x)=>x===i&&<Icon key={x} size={17}/>)}</div><strong>{v}</strong>{c&&<small>{c} <span>{active==='Attendance'?'':'vs last period'}</span></small>}</article>)}</div>
    <div className="module-card"><div className="module-tabs">{tabNames.map(t=><button className={activeTab===t?'active':''} onClick={()=>setTab(t)} key={t}>{t}</button>)}</div>{loadError&&<div className="admin-alert">Live data unavailable: {loadError}.</div>}
      {tabData==='kanban'?<KanbanView/>:tabData==='pipeline'?<PipelineView/>:<><div className="table-toolbar"><div><Search size={16}/><input placeholder={`Search ${activeTab.toLowerCase()}...`} value={search} onChange={e=>setSearch(e.target.value)}/></div><button onClick={()=>notify('Advanced filters opened')}><SlidersHorizontal size={15}/> Filters <b>2</b></button><button onClick={()=>notify('View layout changed')}><Columns3 size={15}/><span>Columns</span></button><button onClick={()=>notify(`${activeTab} exported successfully`)}><Download size={15}/><span>Export</span></button></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th><input type="checkbox" aria-label="Select all"/></th>{displayColumns.map(c=><th key={c}>{c}</th>)}<th/></tr></thead><tbody>{rows.map((row,ri)=><tr key={row[0]+ri} onClick={()=>setDetail(row)}><td onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={`Select ${row[0]}`}/></td>{row.map((cell,ci)=><td key={ci}>{ci===0?<div className="primary-cell"><span>{cell.slice(0,2).toUpperCase()}</span><b>{cell}</b></div>:ci===row.length-1?<Badge>{cell}</Badge>:cell}</td>)}<td><button><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table>{rows.length===0&&<div className="empty-state"><Clock3 size={28}/><b>{active==='Attendance'?'No attendance recorded':'No matching records'}</b><span>{active==='Attendance'?'Use Check in to create your first live attendance record.':'Try a different search term.'}</span></div>}</div><div className="table-footer"><span>Showing {rows.length} records</span><div><button disabled>Previous</button><button className="active">1</button><button>2</button><button>3</button><button>Next</button></div></div></>}
    </div>
    {modal&&active!=='Attendance'&&<CreateModal config={config} busy={saving} onClose={()=>setModal(false)} onCreate={createRecord}/>}
    {detail&&<DetailDrawer row={detail} columns={displayColumns} onClose={()=>setDetail(null)} notify={notify} onArchive={archiveRecord} onSave={saveRecord} editable={Boolean(resourceModule)&&active!=='Attendance'}/>}
  </div>
}
