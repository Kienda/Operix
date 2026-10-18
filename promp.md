MASTER AGENT PROMPT — DESIGN AND BUILD Operix
You are a senior product designer, UX architect, SaaS strategist, software architect, security engineer, database designer, and full-stack developer with more than 10 years of experience building enterprise management systems, ERP platforms, CRM systems, payroll software, inventory systems, field-service applications, and multi-tenant SaaS products.
Your assignment is to design and build a production-ready platform called:
Operix
Tagline
Manage Everything. Grow Everywhere.
The product is created by:
Global High Tech LLC
Company slogan:
Design • Build • Innovate • Grow

1. Product vision
   Operix is a cloud-based, multi-tenant business management platform that allows companies to manage their complete operations from one secure system.
   The platform must combine:
   CRM
   Sales
   Quotations
   Contracts
   Projects
   Work orders
   Invoices
   Receipts
   Manual payment records
   Customer balances
   Inventory
   Printing-material tracking
   Production
   Suppliers
   Procurement
   Expenses
   Finance
   Employees
   Attendance
   Payroll
   Security-guard tracking
   GPS check-in and check-out
   Visitor management
   Assets
   Notifications
   Customer portals
   Reports
   Audit logs
   Multi-branch management
   Multi-country operations
   The platform must initially be used internally by Global High Tech in the United States and Guinea.
   It must also be designed from the beginning as a commercial SaaS platform that can be sold to other companies.

2. Core product principle
   Build one platform with multiple configurable modules.
   Do not build separate disconnected applications.
   Use:
   One authentication system
   One organization system
   One permission system
   One notification center
   One document center
   One reporting framework
   One audit system
   One shared design system
   One backend
   One database architecture
   One web application
   One mobile application for field employees
   Each company must activate only the modules it needs.

3. Target businesses
   The platform should support:
   Printing companies
   Technology companies
   Software-development agencies
   Marketing agencies
   Construction companies
   Security companies
   Retail businesses
   Manufacturers
   Consulting companies
   Cleaning companies
   Logistics businesses
   NGOs
   Schools
   Professional-service companies
   Multi-branch organizations
   Do not hard-code the application only for printing.
   Build a general business-management foundation with optional industry-specific modules.

4. SaaS multi-tenancy
   The platform must be multi-tenant.
   Each subscribed business receives a completely isolated organization workspace.
   Example:
   Platform
   ├── Global High Tech
   │ ├── GHT USA
   │ └── GHT Guinea
   │
   ├── ABC Printing
   │ ├── Conakry Branch
   │ └── Kindia Branch
   │
   └── XYZ Construction
   ├── New York Office
   └── New Jersey Office
   Each organization must have:
   Its own users
   Its own branches
   Its own customers
   Its own employees
   Its own services
   Its own inventory
   Its own financial records
   Its own templates
   Its own reports
   Its own settings
   Its own documents
   Its own notification preferences
   No organization may access another organization’s data.
   Every tenant-owned database record must include:
   organization_id
   Every relevant record should also support:
   branch_id
   created_by
   updated_by
   created_at
   updated_at
   status
   Tenant isolation must be enforced in the backend and database, not only in the interface.

5. Administrative levels
   Create the following administrative levels.
   5.1 Platform Super Admin
   The Platform Super Admin manages the SaaS platform.
   Capabilities:
   Create and manage organizations
   Approve or suspend organizations
   Manage subscription plans
   Enable or disable modules
   Manage platform-wide configurations
   View system health
   Manage platform support
   Manage feature flags
   View platform usage
   Manage platform administrators
   Review security logs
   Manage global notification templates
   Manage pricing plans
   Manage billing status
   Manage storage limits
   Manage user limits
   Manage branch limits
   The Platform Super Admin should not casually access private business records. Support access must be controlled, temporary, justified, and audited.
   5.2 Company Owner
   The Company Owner manages one organization.
   Capabilities:
   Create branches
   Create users
   Create custom roles
   Assign permissions
   Enable modules
   Configure services
   Configure currencies
   Configure payment methods
   Configure document numbering
   Configure notification channels
   View all authorized organization data
   View company-wide reports
   Approve sensitive transactions
   Configure workflow rules
   Configure project requirements
   Configure contract requirements
   Configure payroll settings
   Configure attendance rules
   5.3 Company Administrator
   The Company Administrator supports the Company Owner but may have limited access depending on permissions.
   5.4 Branch Manager
   The Branch Manager may only access authorized branches.
   5.5 Employees
   Employees see only the modules and records allowed by their assigned role and direct permissions.
   5.6 Customer
   Customers access a secure customer portal containing only their own information.

6. Role-based and permission-based access control
   Implement both:
   Role-Based Access Control
   User-specific permission overrides
   Default roles:
   Platform Super Admin
   Platform Support Admin
   Company Owner
   Company Administrator
   Branch Manager
   Finance Manager
   Accountant
   Sales Representative
   Customer Service Agent
   Project Manager
   Designer
   Developer
   Marketing Manager
   Production Manager
   Printer Operator
   Inventory Manager
   Purchasing Officer
   Human Resources Manager
   Payroll Manager
   Security Supervisor
   Security Guard
   Technician
   Installer
   Driver
   Auditor
   Read-only User
   Customer
   Example permissions:
   customers.view
   customers.create
   customers.update
   customers.archive

leads.view
leads.create
leads.assign

quotations.create
quotations.send
quotations.approve
quotations.cancel

contracts.create
contracts.send
contracts.approve
contracts.upload_signed
contracts.countersign

payments.record
payments.verify
payments.reverse
payments.refund

expenses.create
expenses.approve
expenses.pay

inventory.view
inventory.receive
inventory.issue
inventory.adjust
inventory.transfer

payroll.view
payroll.process
payroll.approve
payroll.lock

attendance.view
attendance.override
attendance.approve

security.incidents.create
security.incidents.view
security.patrols.manage

reports.view
reports.export

settings.manage
roles.manage
users.manage
Every backend endpoint must verify permissions.

7. Main platform modules
   Build the following modules.

7.1 Organization and branch management
Features:
Organization profile
Legal business name
Public business name
Company logo
Brand colors
Country
Time zone
Default currency
Additional currencies
Tax settings
Business registration information
Phone numbers
Email addresses
Website
Social-media links
Company code
Document numbering format
Notification settings
Storage limits
Enabled modules
Branch features:
Branch name
Branch code
Address
Country
Currency
Phone
Email
Time zone
Branch manager
Warehouse
Production facility
Operating hours
Active/inactive status

7.2 Dashboard
Create role-specific dashboards.
Company Owner dashboard
Display:
Revenue
Payments received
Outstanding customer balances
Expenses
Estimated profit
Active projects
Active work orders
New leads
Pending quotations
Pending contracts
Contracts awaiting signatures
Low-stock materials
Delayed jobs
Employees currently checked in
Payroll status
Branch performance
Material waste
Recent transactions
Recent audit activity
Important alerts
Filters:
Today
This week
This month
Quarter
Year
Custom range
Branch
Service
Department
Employee
Currency
Employee dashboard
Only show:
Assigned work
Relevant notifications
Deadlines
Required approvals
Personal attendance
Personal tasks
Authorized records
Security dashboard
Display:
Guards currently checked in
Guards outside assigned zones
Active patrols
Missed checkpoints
Open incidents
Visitors currently on site
Late guards
Shift coverage

7.3 CRM and customer management
Each customer profile must contain:
Customer ID
Customer type
Individual or company
Customer name
Company name
Email
Phone
WhatsApp number
Address
Country
City
Tax information
Preferred language
Preferred currency
Assigned branch
Assigned salesperson
Assigned project manager
Communication preferences
Payment terms
Notes
Status
Tags
Files
Customer portal status
Customer history:
Leads
Quotations
Contracts
Projects
Work orders
Invoices
Payments
Receipts
Refunds
Deliveries
Support tickets
Communication history
Uploaded files
Account balance
From one customer page, authorized users should see:
Total quotations
Total orders
Total invoiced
Total paid
Remaining balance
Active contracts
Active projects
Completed projects
Materials used
Recent communications

7.4 Leads and sales pipeline
Pipeline stages:
New
Contacted
Qualified
Meeting scheduled
Proposal requested
Quotation sent
Negotiation
Won
Lost
Archived
Features:
Lead assignment
Lead source
Follow-up date
Notes
Activities
Email history
Call records
Meeting records
Conversion to customer
Conversion reports
Salesperson performance

7.5 Services catalog
Allow each company to create configurable services.
Fields:
Service name
Service category
Description
Default price
Currency
Taxable status
Estimated duration
Required department
Contract required
Deposit required
Approval required
Required materials
Available branches
Status
Example service categories:
Design
Logo design
Brand identity
Business-card design
Flyer design
Social-media design
Packaging design
Development
Website development
E-commerce
Mobile application
Custom software
Website maintenance
Hosting
Domain management
Marketing
Social-media management
SEO
Paid advertising
Content creation
Email marketing
Marketing consulting
Printing
Business cards
Banners
Stickers
Vehicle wrapping
T-shirt printing
Signage
UV printing
DTF printing
CNC cutting
Packaging
Posters

7.6 Quotations and proposals
Quotation features:
Draft quotation
Line items
Services
Products
Quantity
Unit price
Discounts
Taxes
Currency
Deposit requirement
Payment schedule
Notes
Terms
Expiration date
Internal approval
Customer approval
PDF generation
Email sending
Customer portal delivery
Version history
Statuses:
Draft
Pending internal approval
Approved
Sent
Viewed
Accepted
Rejected
Changes requested
Expired
Converted
Cancelled
Customer actions:
View quotation
Download PDF
Accept
Reject
Request changes
Add comments

7.7 Contract management
Contracts must be optional per project or required depending on the service.
Contract requirement options:
Not required
Required before work starts
Required before production
Required before materials are issued
Required before final delivery
Required before installation
Contract templates:
General service agreement
Website development agreement
Software development agreement
Digital-marketing agreement
Graphic-design agreement
Printing agreement
Installation agreement
Maintenance agreement
Monthly-retainer agreement
Non-disclosure agreement
Employment agreement
Supplier agreement
Contract workflow:
Draft
→ Internal Review
→ Approved for Sending
→ Sent
→ Viewed
→ Awaiting Signature
→ Signed by Customer
→ Signed by Company
→ Fully Executed
→ Locked
→ Archived
Support:
Automatic data insertion
Contract numbers
Contract templates
Dynamic fields
Contract versions
Internal approvals
Customer download
Customer upload of signed contract
Employee upload on behalf of customer
Signed contract verification
Company countersignature
Contract expiration
Renewal reminders
Amendments
Addenda
Change orders
Secure storage
Audit history
Do not overwrite signed contracts.
Every revision must create a new version.
Once fully executed, the signed version must be locked.
If a contract is required and not completed, block configured project actions.
Example blocked actions:
Starting project
Starting production
Issuing materials
Scheduling installation
Delivering final files
Closing project
Allow authorized override only with:
Written reason
User identity
Timestamp
Audit event

7.8 Project management
Support:
Software projects
Marketing campaigns
Printing jobs
Construction projects
Installation jobs
Consulting engagements
Internal projects
Project fields:
Project number
Project name
Customer
Branch
Service
Project manager
Team
Start date
Due date
Priority
Budget
Currency
Contract requirement
Payment requirement
Deposit status
Project status
Progress percentage
Tags
Files
Notes
Features:
Tasks
Milestones
Kanban board
Calendar
Dependencies
Team assignment
Time tracking
Comments
File uploads
Client approvals
Design approvals
Deliverables
Budget tracking
Progress reports
Activity log
Statuses:
Draft
Awaiting approval
Awaiting contract
Awaiting deposit
Ready to start
In progress
On hold
Waiting for customer
Under review
Completed
Cancelled
Archived

7.9 Orders and work orders
Use a general work-order system adaptable to many industries.
Workflow:
Lead
→ Customer
→ Quotation
→ Customer Approval
→ Contract
→ Deposit
→ Work Order
→ Production or Execution
→ Quality Control
→ Delivery
→ Completion
Work-order features:
Work-order number
Customer
Project
Service
Assigned team
Required materials
Machine assignment
Labor estimate
Start date
Due date
Priority
Instructions
Files
Quality checks
Delivery details
Completion proof
Statuses:
Draft
Pending approval
Approved
Waiting for materials
Ready
Assigned
In progress
Quality control
Ready for pickup
Ready for delivery
Delivered
Installed
Completed
Cancelled

7.10 Manual payments and customer balances
The platform does not initially process payments directly.
It records payments received externally.
Supported methods:
Cash
Bank transfer
Orange Money
MTN Mobile Money
Check
Card paid externally
ACH
Wire transfer
Other
Payment fields:
Payment number
Customer
Invoice
Order
Project
Amount
Currency
Method
Reference
Date
Received by
Branch
Proof of payment
Notes
Verification status
Verified by
Verification date
Payment workflow:
Recorded
→ Pending Verification
→ Verified
→ Receipt Generated
→ Customer Notified
Statuses:
Draft
Pending verification
Verified
Rejected
Reversed
Refunded
Partially refunded
Sensitive payment actions require audit logs.
Never permanently delete verified financial records.
Use:
Reversal
Correction
Refund
Credit note
Archive
Track:
Invoice total
Deposit paid
Additional payments
Total paid
Remaining balance
Due date
Overdue amount
Payment history

7.11 Invoices, receipts, and business documents
Automatically generate:
Quotation
Proposal
Pro forma invoice
Invoice
Deposit receipt
Payment receipt
Final payment receipt
Refund receipt
Credit note
Debit note
Delivery note
Purchase order
Customer statement
Work-completion certificate
Payroll payslip
Every document should contain:
Company logo
Business information
Branch information
Customer information
Document number
Issue date
Due date
Related order or project
Items
Quantity
Unit price
Discount
Tax
Total
Amount paid
Remaining balance
Payment method
Payment reference
Terms
Notes
QR verification code
Signature area
Downloadable PDF
Number examples:
GHT-GN-QUO-2026-000001
GHT-GN-INV-2026-000001
GHT-GN-RCP-2026-000001
GHT-US-CTR-2026-000001
Allow each organization to configure its numbering format.

7.12 Customer notifications
Support notification channels:
In-app
Email
SMS
WhatsApp
Push notifications
Customer portal
Downloadable document link
Customer notifications include:
Sales
Quotation created
Quotation sent
Quotation viewed
Quotation expiring
Quotation accepted
Quotation rejected
Changes requested
Contracts
Contract ready
Contract sent
Contract viewed
Signature reminder
Contract signed
Company countersigned
Contract fully executed
Contract expiring
Contract renewal approaching
Payments
Deposit received
Payment awaiting verification
Payment verified
Payment rejected
Receipt available
Balance reminder
Payment due
Payment overdue
Refund issued
Projects and production
Project created
Project started
Design ready
Customer approval required
Production started
Project delayed
Quality control completed
Ready for pickup
Ready for delivery
Installation scheduled
Delivered
Completed
Renewals
Domain renewal
Hosting renewal
Maintenance renewal
Subscription renewal
Contract renewal
Customer communication preferences:
Preferred language
Preferred email
Preferred phone
Email enabled
SMS enabled
WhatsApp enabled
Push enabled
Marketing consent
Transactional notification preferences
Separate transactional notifications from marketing messages.
Track notification history:
Channel
Template
Recipient
Status
Sent time
Delivered time
Opened time
Failure reason
Related record
Triggered by

7.13 Customer portal
Create a secure customer portal.
Customers can:
View profile
View quotations
Accept or reject quotations
Request quotation changes
View contracts
Download contracts
Upload signed contracts
Electronically sign later
View projects
View progress
View tasks shared with them
Approve designs
Request revisions
View invoices
Download receipts
View payment history
View remaining balances
Upload payment proof
View delivery status
Confirm delivery
View documents
Open support tickets
Communicate with assigned staff
Manage notification preferences
Customers must only access their own records.

7.14 Inventory management
Support:
Raw materials
Finished products
Consumables
Tools
Spare parts
Printing materials
Construction materials
Office supplies
Inventory item fields:
Item code
Name
Category
Description
Branch
Warehouse
Supplier
Unit
Purchase cost
Usage cost
Selling price
Currency
Current quantity
Reserved quantity
Available quantity
Minimum stock
Maximum stock
Reorder point
Batch
Lot
Roll
Expiration date
Storage location
Status
Supported units:
Piece
Box
Pack
Roll
Meter
Square meter
Sheet
Liter
Milliliter
Kilogram
Gram
Cartridge
Bottle
Inventory movements:
Initial stock
Purchase receipt
Transfer
Reservation
Issue to job
Return
Damage
Waste
Adjustment
Sale
Expiration
Every movement must be traceable.

7.15 Printing-material tracking
Special printing functionality must support:
Vinyl rolls
Banner rolls
One-way vision
Lamination film
UV film
DTF film
UV ink
DTF ink
Powder
PVC
Forex
Acrylic
Paper
Adhesive
Packaging materials
Roll fields:
Roll ID
Material
Width
Original length
Remaining length
Supplier
Cost
Date received
Branch
Warehouse
Jobs that consumed material
Sheet fields:
Sheet ID
Material
Width
Height
Thickness
Original quantity
Remaining quantity
Damaged quantity
Jobs consuming sheets
Example:
Roll ID: VIN-2026-004
Material: Printable vinyl
Width: 1.52 m
Original length: 50 m
Used: 18.5 m
Remaining: 31.5 m

7.16 Materials used per customer and job
Every job should display:
Materials reserved
Materials issued
Materials used
Materials returned
Waste
Estimated material cost
Actual material cost
Example:
Customer: ABC Construction
Project: Vehicle Branding

Materials used:

- 14 meters printable vinyl
- 14 meters lamination
- 2 sheets of PVC
- 500 ml cleaning solution

Labor:

- 4 hours printing
- 6 hours installation

Machine time:

- 3 hours
  This data must contribute to profitability calculations.

  7.17 Waste tracking
  Waste reasons:
  Printing error
  Incorrect dimensions
  Machine issue
  Color issue
  Installation damage
  Design error
  Material defect
  Training waste
  Customer change
  Other
  Waste fields:
  Material
  Quantity
  Unit
  Cost
  Work order
  Employee
  Machine
  Reason
  Photo
  Approval status
  Notes
  Waste reports:
  By employee
  By machine
  By material
  By branch
  By service
  By month
  Total estimated cost

  7.18 Production management
  Features:
  Production queue
  Job priorities
  Machine assignment
  Operator assignment
  Material reservation
  Material issue
  Production start
  Production pause
  Production completion
  Quality control
  Rework
  Waste
  Delivery readiness
  Installation scheduling
  Production stages should be configurable by organization and industry.

  7.19 Machine and asset management
  Track:
  CNC machines
  UV printers
  DTF printers
  Large-format printers
  Computers
  Vehicles
  Cameras
  Tools
  Furniture
  Security equipment
  Asset fields:
  Asset ID
  Name
  Category
  Model
  Serial number
  Purchase date
  Purchase cost
  Branch
  Assigned employee
  Status
  Warranty
  Maintenance interval
  Last maintenance
  Next maintenance
  Documents
  Photos
  Repair history
  Machine features:
  Compatible materials
  Jobs completed
  Downtime
  Maintenance schedule
  Repair costs
  Operator assignments
  Production hours

  7.20 Supplier and procurement management
  Supplier profile:
  Supplier name
  Contact person
  Phone
  Email
  Address
  Country
  Currency
  Materials supplied
  Payment terms
  Purchase history
  Outstanding balance
  Documents
  Rating
  Status
  Procurement workflow:
  Purchase Request
  → Manager Approval
  → Supplier Selection
  → Purchase Order
  → Order Sent
  → Goods Received
  → Quality Verification
  → Supplier Invoice
  → Payment Recorded
  → Closed
  Support:
  Purchase requests
  Approval rules
  Purchase orders
  Partial receiving
  Full receiving
  Damaged items
  Supplier invoices
  Supplier payments
  Stock updates

  7.21 Expense management
  Expense categories:
  Materials
  Transportation
  Fuel
  Rent
  Electricity
  Internet
  Salaries
  Maintenance
  Repairs
  Marketing
  Software subscriptions
  Hosting
  Domains
  Insurance
  Professional services
  Taxes
  Other
  Workflow:
  Draft
  → Submitted
  → Manager Approval
  → Finance Approval
  → Paid
  → Archived
  Expense fields:
  Category
  Description
  Amount
  Currency
  Branch
  Vendor
  Date
  Payment method
  Reference
  Receipt
  Submitted by
  Approved by
  Status

  7.22 Human resources
  Employee profile:
  Employee ID
  Full name
  Photo
  Email
  Phone
  Address
  Emergency contact
  Department
  Position
  Branch
  Manager
  Hire date
  Employment type
  Salary type
  Currency
  Schedule
  Status
  Documents
  Bank details
  Tax information
  Benefits
  Leave balances
  Attendance history
  Payroll history
  Employment types:
  Full-time
  Part-time
  Contract
  Temporary
  Freelance
  Intern
  Remote
  Shift worker
  HR features:
  Employee onboarding
  Employee documents
  Departments
  Positions
  Leave
  Performance reviews
  Training
  Certifications
  Offboarding

  7.23 Payroll
  Payroll must be a configurable module.
  Salary types:
  Monthly
  Weekly
  Biweekly
  Hourly
  Daily
  Commission
  Project-based
  Mixed compensation
  Payroll calculations:
  Base salary
  Regular hours
  Overtime
  Bonuses
  Commissions
  Allowances
  Benefits
  Reimbursements
  Taxes
  Insurance
  Leave deductions
  Late deductions
  Absence deductions
  Salary advances
  Employee loans
  Other deductions
  Net salary
  Payroll workflow:
  Draft
  → HR Review
  → Department Review
  → Finance Approval
  → Owner Approval
  → Locked
  → Payment Recorded
  → Payslips Generated
  Payroll payment methods:
  Bank transfer
  Cash
  Check
  Mobile money
  Other
  The platform records salary payments but does not initially need to initiate bank transfers.
  Payslips must be generated as PDFs.
  Employee self-service:
  View payslips
  Download payslips
  View salary history
  View deductions
  Submit expenses
  Request leave
  Request salary advance
  View loan balance
  View attendance
  Support multi-country payroll configuration but do not hard-code country tax rules without verified legal requirements.

  7.24 Attendance and shift management
  Features:
  Shift creation
  Work schedules
  Employee assignment
  Check-in
  Check-out
  Breaks
  Late arrival
  Early departure
  Absence
  Overtime
  Missed shifts
  Attendance approvals
  Attendance corrections
  Check-in data:
  Employee
  Date
  Server time
  Device time
  Latitude
  Longitude
  Accuracy
  Address
  Device ID
  IP address
  Network
  Photo
  Selfie
  Geofence result
  Status
  Attendance records must integrate with payroll after manager approval.

  7.25 Security-guard and field-work module
  Security guards and field workers need a mobile-first portal.
  Features:
  GPS check-in
  GPS check-out
  Location verification
  Geofencing
  Assigned shifts
  Patrol routes
  Patrol checkpoints
  QR checkpoint scanning
  NFC checkpoints later
  Photo evidence
  Incident reporting
  Visitor management
  Emergency SOS
  Offline mode
  Sync after internet returns
  Check-in and check-out
  Track:
  Employee
  Shift
  Time
  Server timestamp
  GPS coordinates
  Accuracy
  Address
  Assigned location
  Inside or outside geofence
  Device
  Selfie
  Supervisor approval
  Notes
  The organization should define whether outside-zone check-in:
  Is rejected
  Is accepted but flagged
  Requires approval
  Patrol management
  Patrol route example:
  Front Gate
  → Parking Area
  → Warehouse
  → Production Floor
  → Server Room
  Checkpoint verification methods:
  QR code
  GPS
  Photo
  Manual confirmation
  NFC later
  Track:
  Arrival time
  Departure time
  Location
  Missed checkpoint
  Late checkpoint
  Notes
  Photos
  Incidents
  Incident management
  Incident categories:
  Unauthorized access
  Theft
  Fire
  Medical emergency
  Equipment damage
  Suspicious activity
  Vehicle accident
  Visitor issue
  Safety issue
  Other
  Incident fields:
  Title
  Description
  Priority
  Date
  Time
  Location
  Photos
  Videos
  Voice notes
  Reported by
  Assigned manager
  Status
  Resolution
  Follow-up
  Visitor management
  Track:
  Visitor name
  Phone
  Company
  Host employee
  Reason for visit
  ID type
  ID number
  Photo
  Vehicle plate
  Entry time
  Exit time
  Badge number
  Status

  7.26 Location privacy and compliance
  Location tracking must:
  Be enabled only for authorized roles
  Track employees only during active shifts, check-ins, patrols, or assigned field work
  Clearly inform employees
  Follow company policy
  Encrypt sensitive location data
  Restrict access
  Log who viewed location data
  Support data-retention rules
  Allow organizations to disable continuous tracking
  Avoid unnecessary background tracking
  Do not expose employee location to unauthorized users.

  7.27 Internal notifications
  Internal alerts include:
  New lead
  Quotation approval required
  Contract approval required
  Contract signed
  Payment pending verification
  Large payment recorded
  Payment modified
  Payment reversed
  Expense approval required
  Low inventory
  Material waste reported
  Production delayed
  Machine maintenance due
  Payroll approval required
  Late employee
  Missed shift
  Guard outside geofence
  Patrol checkpoint missed
  Emergency incident
  Visitor arrival
  Customer complaint
  Failed login
  Permission change
  The Super Admin or Company Owner must control which roles receive each notification.

  7.28 Document center
  Create one centralized document center.
  Document categories:
  Customer documents
  Contracts
  Signed contracts
  Quotations
  Invoices
  Receipts
  Payment proof
  Supplier documents
  Purchase orders
  Employee documents
  Payslips
  Incident reports
  Design files
  Project deliverables
  Maintenance records
  Visitor documents
  Features:
  Secure uploads
  Permissions
  Version control
  Search
  Tags
  Folder organization
  Preview
  Download
  Archive
  Retention rules
  File hashes
  Audit history

  7.29 Reports and analytics
  Reports:
  Sales
  Leads
  Conversion rate
  Quotations
  Won and lost sales
  Sales by representative
  Sales by service
  Sales by branch
  Finance
  Revenue
  Payments
  Outstanding balances
  Expenses
  Cash flow
  Refunds
  Profit estimate
  Revenue by currency
  Branch financial performance
  Projects
  Active projects
  Delayed projects
  Completed projects
  Project profitability
  Team workload
  Inventory
  Current stock
  Low stock
  Material consumption
  Stock valuation
  Inventory movements
  Waste
  Supplier purchases
  Production
  Jobs completed
  Production time
  Machine usage
  Rework
  Waste
  Delivery performance
  HR and payroll
  Employee count
  Attendance
  Overtime
  Absences
  Leave
  Payroll cost
  Benefits
  Deductions
  Department payroll
  Security
  Guard attendance
  Patrol completion
  Missed checkpoints
  Incidents
  Visitor activity
  Geofence violations
  Reports should support:
  Date filters
  Branch filters
  Employee filters
  Department filters
  Service filters
  Currency filters
  PDF export
  Excel export
  CSV export
  Never combine multiple currencies without an explicitly configured exchange-rate process.

  7.30 Audit logs
  Every sensitive action must be logged.
  Examples:
  Login
  Failed login
  User created
  Role changed
  Permission changed
  Payment created
  Payment verified
  Payment reversed
  Expense approved
  Contract sent
  Contract signed
  Inventory adjusted
  Payroll processed
  Attendance edited
  Geofence override
  Project status changed
  Document deleted or archived
  Audit fields:
  Organization
  Branch
  User
  Action
  Entity type
  Entity ID
  Previous value
  New value
  Reason
  Timestamp
  IP address
  Device
  Correlation ID
  Audit records should be immutable for normal users.

8. Industry packs
   Create configurable industry packs.
   Printing Pack
   Roll tracking
   Sheet tracking
   Ink tracking
   Production queue
   UV printing
   DTF printing
   CNC jobs
   Lamination
   Material usage
   Waste
   Installation
   Software Agency Pack
   Projects
   Milestones
   Development stages
   Client approvals
   Domains
   Hosting
   Deployments
   Maintenance
   Support tickets
   Marketing Agency Pack
   Campaigns
   Content calendars
   Client approvals
   Social-media tasks
   Monthly reports
   Retainers
   Security Pack
   Guard shifts
   GPS attendance
   Geofences
   Patrols
   Visitors
   Incidents
   SOS
   Construction Pack
   Sites
   Materials
   Equipment
   Daily reports
   Contractors
   Safety incidents
   Work orders
   Do not create completely separate products for each pack. Use shared modules and configurable terminology.

9. Subscription plans
   Create configurable plans.
   Starter
   Suggested limits:
   1 organization
   1 branch
   3 users
   CRM
   Customers
   Quotations
   Invoices
   Receipts
   Basic reports
   Professional
   Up to 5 branches
   Up to 20 users
   Projects
   Contracts
   Inventory
   Expenses
   Notifications
   Customer portal
   Advanced reports
   Business
   More users
   More branches
   Production
   HR
   Payroll
   Security module
   Advanced permissions
   API access
   Enterprise
   Custom users
   Custom branches
   Dedicated support
   White-label branding
   Custom modules
   Dedicated infrastructure
   Data migration
   Custom domain
   Advanced audit controls
   Allow annual subscriptions and negotiated pricing.
   The first internal GHT account may use a special internal plan.

10. Recommended technology stack
    Use the following stack unless a clearly documented reason requires a change.
    Web frontend
    Next.js
    React
    TypeScript
    App Router
    Tailwind CSS
    shadcn/ui
    TanStack Query
    React Hook Form
    Zod
    Zustand
    Backend
    Node.js
    NestJS
    TypeScript
    REST API
    OpenAPI/Swagger
    WebSockets where necessary
    Database
    PostgreSQL
    Prisma ORM
    PostGIS
    PostgreSQL Row-Level Security where practical
    Mobile
    React Native
    Expo
    Expo Router
    TypeScript
    Expo Location
    Expo Camera
    Expo Notifications
    SecureStore
    Offline synchronization
    Cache and jobs
    Redis
    BullMQ
    Storage
    Cloudflare R2 or AWS S3
    Private buckets
    Presigned uploads
    Authentication
    JWT access tokens
    Rotating refresh tokens
    Argon2id
    MFA
    Session management
    Device management
    Google and Microsoft login later
    Notifications
    Resend, Postmark, or Amazon SES for email
    Twilio or local provider for SMS
    WhatsApp Business Cloud API
    Expo push notifications
    Maps
    Google Maps or Mapbox
    PostGIS for geofences and distance calculations
    PDF and documents
    React PDF, PDFKit, or server-side HTML-to-PDF
    QR codes
    SHA-256 file hashes
    Monitoring
    Sentry
    OpenTelemetry
    Pino
    Better Stack or Grafana Cloud
    Testing
    Vitest or Jest
    Supertest
    Playwright
    Testcontainers
    k6
    Deployment
    Vercel for web
    Railway or AWS for backend
    Managed PostgreSQL
    Managed Redis
    Cloudflare DNS and WAF
    GitHub Actions
    Monorepo
    pnpm
    Turborepo

11. Recommended repository structure
    ght-360/
    ├── apps/
    │ ├── web/
    │ ├── api/
    │ ├── mobile/
    │ └── worker/
    │
    ├── packages/
    │ ├── ui/
    │ ├── types/
    │ ├── validation/
    │ ├── permissions/
    │ ├── config/
    │ ├── database/
    │ └── eslint-config/
    │
    ├── infrastructure/
    │ ├── docker/
    │ ├── deployment/
    │ └── monitoring/
    │
    ├── docs/
    │ ├── product/
    │ ├── architecture/
    │ ├── api/
    │ ├── security/
    │ └── deployment/
    │
    └── tests/

12. Backend module structure
    src/
    ├── auth/
    ├── organizations/
    ├── subscriptions/
    ├── branches/
    ├── users/
    ├── roles/
    ├── permissions/
    ├── customers/
    ├── leads/
    ├── services/
    ├── quotations/
    ├── contracts/
    ├── projects/
    ├── work-orders/
    ├── invoices/
    ├── payments/
    ├── receipts/
    ├── expenses/
    ├── inventory/
    ├── suppliers/
    ├── procurement/
    ├── production/
    ├── assets/
    ├── employees/
    ├── attendance/
    ├── payroll/
    ├── security-patrols/
    ├── visitors/
    ├── incidents/
    ├── documents/
    ├── notifications/
    ├── reports/
    ├── audit/
    └── settings/

13. Database requirements
    Create a normalized relational data model.
    Required tables should include at minimum:
    organizations
    organization_settings
    subscription_plans
    subscriptions
    modules
    organization_modules

branches
departments
positions

users
sessions
devices
organization_users
roles
permissions
role_permissions
user_permissions

customers
customer_contacts
customer_addresses
customer_preferences
leads
lead_activities

services
service_categories

quotations
quotation_items
quotation_versions
quotation_approvals

contract_templates
contracts
contract_versions
contract_parties
contract_signatures
contract_attachments
contract_approvals
contract_events

projects
project_members
project_milestones
tasks
task_comments
time_entries
project_files

work_orders
work_order_assignments
work_order_status_history
quality_checks

invoices
invoice_items
payments
payment_allocations
payment_verifications
receipts
refunds
credit_notes

expenses
expense_approvals

inventory_items
inventory_locations
inventory_batches
inventory_rolls
inventory_sheets
inventory_movements
inventory_reservations
material_usage
waste_records

suppliers
purchase_requests
purchase_request_items
purchase_orders
purchase_order_items
goods_receipts
supplier_payments

assets
asset_assignments
maintenance_records

employees
employee_documents
employment_contracts
work_schedules
shifts
leave_types
leave_requests
attendance_records
attendance_breaks
attendance_adjustments

payroll_periods
payroll_runs
payroll_items
payroll_earnings
payroll_deductions
payslips
employee_loans
salary_advances
reimbursements

geofences
guard_assignments
patrol_routes
patrol_checkpoints
patrol_sessions
checkpoint_events
incidents
incident_attachments
visitors
visitor_events

notifications
notification_templates
notification_preferences
notification_deliveries

documents
document_versions
attachments

audit_logs
activity_logs
Add indexes for:
organization_id
branch_id
customer_id
employee_id
status
created_at
document numbers
invoice numbers
payment references
contract numbers
project numbers
Use database transactions for:
Payment verification
Inventory movements
Material usage
Receipt creation
Payroll locking
Contract execution
Order completion

14. UX and visual-design direction
    Design a clean, premium, enterprise-quality interface.
    The platform should feel:
    Professional
    Modern
    Trustworthy
    International
    Scalable
    Simple despite complexity
    Fast
    Accessible
    Mobile responsive
    Avoid:
    Excessive gradients
    Decorative clutter
    Too many icons
    Overcrowded dashboards
    Tiny text
    Unclear statuses
    Excessive modal windows
    Use:
    Strong hierarchy
    Spacious layouts
    Clear cards
    Consistent tables
    Global search
    Helpful filters
    Saved views
    Status badges
    Activity timelines
    Step-by-step forms
    Empty states
    Skeleton loading
    Confirmation dialogs
    Accessible color contrast
    Keyboard navigation

15. Branding direction
    Primary brand:
    Operix
    Parent company:
    Global High Tech LLC
    Tagline:
    Manage Everything. Grow Everywhere.
    Parent company slogan:
    Design • Build • Innovate • Grow
    The design should visually connect to Global High Tech but allow Operix to become a standalone international SaaS product.
    Create:
    Product logo
    Wordmark
    App icon
    Favicon
    Light version
    Dark version
    Horizontal logo
    Square logo
    Login-page branding
    Dashboard branding
    Mobile-app branding
    Use a professional dark blue or deep indigo foundation, white surfaces, neutral grays, and one controlled accent color.
    Do not use excessive gradients.

16. Required main screens
    Design high-fidelity responsive screens for:
    Public website
    Homepage
    Features
    Modules
    Industries
    Pricing
    About
    Contact
    Login
    Request demo
    Privacy
    Terms
    Security
    Authentication
    Login
    Forgot password
    Reset password
    MFA
    Invitation acceptance
    Organization onboarding
    Platform administration
    Platform dashboard
    Organizations
    Subscriptions
    Plans
    Modules
    Support access
    System health
    Security events
    Company administration
    Company dashboard
    Organization settings
    Branches
    Users
    Roles
    Permissions
    Module settings
    Notification settings
    Document templates
    CRM
    Leads
    Pipeline
    Customers
    Customer profile
    Activities
    Sales
    Quotations
    Quotation builder
    Quotation preview
    Approval screen
    Contracts
    Contract templates
    Contract builder
    Contract preview
    Contract versions
    Signature status
    Upload signed contract
    Projects
    Projects list
    Project detail
    Kanban
    Tasks
    Milestones
    Files
    Client approvals
    Work orders
    Work-order list
    Work-order detail
    Production queue
    Quality control
    Finance
    Invoices
    Payments
    Receipts
    Customer balances
    Expenses
    Refunds
    Financial reports
    Inventory
    Inventory dashboard
    Items
    Rolls
    Sheets
    Movements
    Material usage
    Waste
    Low-stock alerts
    Procurement
    Suppliers
    Purchase requests
    Purchase orders
    Receiving
    HR
    Employees
    Employee profile
    Attendance
    Leave
    Performance
    Documents
    Payroll
    Payroll dashboard
    Payroll periods
    Payroll run
    Approvals
    Payslips
    Loans
    Advances
    Reimbursements
    Security
    Guard dashboard
    Shifts
    Geofences
    Patrol routes
    Live patrols
    Checkpoints
    Incidents
    Visitors
    Attendance map
    Customer portal
    Customer dashboard
    Quotations
    Contracts
    Projects
    Invoices
    Payments
    Receipts
    Files
    Messages
    Support
    Reports
    Report dashboard
    Report builder
    Export center
    Audit
    Audit-log viewer
    Record history

17. Mobile application requirements
    Create one role-based mobile application.
    Supported roles:
    Security guard
    Technician
    Installer
    Driver
    Salesperson
    Manager
    Employee
    Mobile features:
    Login
    MFA
    Role-based home
    Check-in
    Check-out
    GPS verification
    Selfie capture
    QR scanning
    Patrol checkpoints
    Incident reporting
    Visitor registration
    Assigned tasks
    Work orders
    File uploads
    Photos
    Notifications
    Offline queue
    Sync status
    SOS
    Design primarily for Android devices with inconsistent connectivity.
    All critical field actions must support offline capture and later synchronization.

18. Security requirements
    Implement:
    HTTPS
    Secure cookies where appropriate
    JWT rotation
    MFA
    Argon2id
    Rate limiting
    CORS allowlist
    Helmet
    Input validation
    Zod or class-validator
    CSRF protection where required
    Parameterized database queries
    File-type validation
    Malware scanning
    Private file storage
    Presigned URLs
    Encryption at rest
    Encryption in transit
    Secret management
    Dependency scanning
    Audit logs
    Backup strategy
    Restore testing
    Session revocation
    Device management
    Brute-force protection
    Login alerts
    Permission-change alerts
    Test tenant isolation thoroughly.
    Never trust:
    organization_id from the frontend
    branch_id from the frontend
    role names from the frontend
    payment totals calculated only by the frontend
    inventory balances calculated only by the frontend
    payroll totals calculated only by the frontend
    The backend must derive and validate all sensitive values.

19. Non-functional requirements
    The application must be:
    Responsive
    Accessible
    Fast
    Secure
    Scalable
    Maintainable
    Well documented
    Testable
    Internationalized
    Multi-currency
    Multi-time-zone
    Offline-capable for mobile field operations
    Performance goals:
    Fast initial dashboard
    Pagination for large tables
    Server-side filtering
    Background exports
    Indexed queries
    Cached reports where appropriate
    Optimistic updates only for low-risk operations

20. Internationalization
    Support:
    English
    French
    Prepare architecture for additional languages.
    Support:
    Localized dates
    Localized numbers
    Localized currencies
    Organization time zones
    User time zones
    Translation keys
    Language-specific notification templates
    Language-specific documents

21. MVP development phases
    Do not build everything simultaneously.
    Phase 1 — Foundation
    Build:
    Monorepo
    Authentication
    Organizations
    Branches
    Users
    Roles
    Permissions
    Audit logs
    Company settings
    Dashboard foundation
    Notifications foundation
    Document storage foundation
    Phase 2 — CRM and sales
    Build:
    Leads
    Customers
    Services
    Quotations
    Customer portal
    Basic invoices
    Manual payments
    Receipts
    Customer balances
    Email notifications
    Phase 3 — Contracts and projects
    Build:
    Contract templates
    PDF generation
    Contract sending
    Signed-contract upload
    Contract versions
    Project blocking
    Projects
    Tasks
    Milestones
    Work orders
    Phase 4 — Inventory and production
    Build:
    Inventory
    Warehouses
    Rolls
    Sheets
    Material usage
    Waste
    Suppliers
    Procurement
    Production queue
    Quality control
    Phase 5 — HR and payroll
    Build:
    Employees
    Departments
    Attendance
    Leave
    Payroll
    Payslips
    Salary advances
    Employee portal
    Phase 6 — Security and field workforce
    Build:
    Mobile app
    GPS attendance
    Geofences
    Patrol routes
    Checkpoints
    Incident reporting
    Visitor management
    Offline sync
    SOS
    Phase 7 — Commercial SaaS launch
    Build:
    Subscription plans
    Organization onboarding
    Feature limits
    Trial system
    Billing integration
    White-label settings
    Platform support tools
    Public marketing site
    Analytics
    Enterprise configuration

22. Agent workflow requirements
    Before writing production code, complete these deliverables:
    Product requirements document
    User-role matrix
    Permission matrix
    User journeys
    Information architecture
    Sitemap
    Module dependency map
    Database ERD
    API specification
    Security threat model
    Multi-tenant isolation strategy
    Design system
    Wireframes
    High-fidelity designs
    MVP scope
    Delivery roadmap
    Test strategy
    Deployment architecture
    Do not skip architecture and directly generate random pages.

23. Required deliverables
    Provide:
    Complete product requirements document
    System architecture diagram
    Database ERD
    Prisma schema
    API endpoint list
    OpenAPI documentation
    Role and permission matrix
    User-flow diagrams
    Responsive design system
    High-fidelity screens
    Web application
    Backend API
    Mobile application
    Seed data
    Automated tests
    Deployment configuration
    Environment-variable template
    Security documentation
    Administrator documentation
    User documentation
    API documentation
    Release checklist

24. Coding standards
    Use:
    Strict TypeScript
    ESLint
    Prettier
    Conventional commits
    Feature-based modules
    Reusable components
    Central validation schemas
    Central permission definitions
    Central error handling
    Typed API responses
    Database migrations
    Seed scripts
    Transactional service methods
    Structured logs
    Avoid:
    any
    Hard-coded roles
    Hard-coded organization IDs
    Hard-coded currencies
    Hard-coded tax logic
    Business logic inside UI components
    Direct database access from controllers
    Unvalidated file uploads
    Client-only permission checks
    Permanent deletion of sensitive records

25. Acceptance criteria
    The platform will be considered successful when:
    Multiple organizations can use the same system securely.
    One company cannot access another company’s data.
    Company owners can configure roles and permissions.
    Customers can receive quotations, contracts, invoices, receipts, and notifications.
    Signed contracts can be uploaded and linked to projects.
    Projects can be blocked until required contracts or deposits are completed.
    Payments can be recorded and verified without processing payments directly.
    Customer balances update accurately.
    Inventory updates automatically when materials are used.
    Printing rolls and sheets can be tracked accurately.
    Material waste can be reported and analyzed.
    Employees can check in and out.
    Security guards can check in with GPS and complete patrol checkpoints.
    Attendance can feed approved hours into payroll.
    Payroll can generate accurate payslips.
    Every sensitive action appears in the audit log.
    Customers only access their own portal records.
    Reports support branch, currency, date, and permission filters.
    The mobile app works with poor connectivity.
    The system is ready to be used internally by GHT and sold to other businesses.

26. Final instruction to the agent
    Design and build Operix as a serious, secure, modular, enterprise-ready SaaS platform.
    Do not produce only a visual dashboard prototype.
    Create a complete working product with:
    Real database integration
    Real authentication
    Real tenant isolation
    Real permissions
    Real workflows
    Real documents
    Real notifications
    Real inventory movements
    Real audit logging
    Real automated tests
    Real deployment documentation
    Prioritize security, tenant isolation, financial accuracy, inventory accuracy, contract traceability, payroll correctness, and mobile reliability.
    Start with the architecture and MVP plan. Then produce the design system, database model, API specification, high-fidelity screens, and phased implementation.
    The final platform must communicate this promise:
    Every customer managed. Every transaction documented. Every project controlled. Every employee accountable. Every business insight accessible from one platform.
