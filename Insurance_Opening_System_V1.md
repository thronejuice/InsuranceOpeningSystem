# Insurance Opening System V1
## Insurance Broker / Agent Management System

> Document Version: 1.0  
> Status: Draft for Development  
> Scope: Insurance Job Opening → Quotation → Proposal → Binding → Policy → Payment → Commission → Renewal

---

## 1. Project Overview

ระบบสำหรับบริษัท Broker / ตัวแทนประกันภัย เพื่อบริหารกระบวนการตั้งแต่รับความต้องการของลูกค้า เปิดงานประกัน ขอใบเสนอราคาจากบริษัทประกัน เปรียบเทียบราคา เสนอให้ลูกค้า ยืนยันการซื้อ ออกกรมธรรม์ ติดตามการชำระเงิน Commission และการต่ออายุ

### 1.1 Main Objectives

- ลดการเปิดงานด้วย Excel / Manual Process
- เก็บข้อมูล Customer และ Insurance Job ไว้ที่ศูนย์กลาง
- รองรับ 1 Job → หลาย Insurance Companies → หลาย Quotations
- ติดตามสถานะงานตั้งแต่เปิดงานจนถึง Policy
- ตรวจสอบเอกสารที่ขาด
- รองรับ Approval และ Audit Trail
- รองรับ Renewal
- รองรับการต่อยอด LINE OA / Email / Automation

### 1.2 Design Principles

1. Customer แยกจาก Job
2. Job แยกจาก Quotation
3. 1 Job สามารถมีหลาย Quotations
4. Product / Risk Fields / Workflow ควร Configurable
5. ทุกการเปลี่ยนแปลงสำคัญต้องมี Audit Trail
6. ใช้ RBAC ควบคุมสิทธิ์
7. รองรับ Soft Delete ใน Master Data ที่เหมาะสม
8. ห้ามลบ Transaction สำคัญแบบ Physical Delete
9. ทุก Transaction ต้องมี created_at / updated_at และผู้ดำเนินการ
10. API ต้อง Validate ข้อมูลฝั่ง Server เสมอ

---

# 2. Scope

## 2.1 MVP

### Authentication & Authorization
- Login
- Logout
- Refresh Token
- User Profile
- Role / Permission

### Customer
- Create Customer
- Edit Customer
- View Customer
- Search Customer
- Customer Contact
- Customer Address

### Insurance Job
- Create Job
- Edit Draft
- Submit Job
- Assign Agent / Staff
- Job Status
- Risk Information
- Coverage
- Document Checklist
- Task / Follow-up

### Quotation
- Request Quotation
- Add Insurance Company
- Record Quotation
- Quotation Items
- Compare Quotations
- Select Quotation

### Proposal
- Create Proposal
- Send Proposal
- Customer Accept / Reject
- Reject Reason

### Binding / Policy
- Binding
- Policy Information
- Policy Document

### Payment
- Payment Record
- Payment Status

### Commission
- Commission Calculation / Record
- Commission Status

### Dashboard
- My Jobs
- Job Status Summary
- Premium Summary
- Renewal Summary

### Audit
- Activity Log
- Status History

---

# 3. Future Scope

- LINE OA
- Email Automation
- Customer Portal
- Online Payment
- OCR Document
- AI Document Extraction
- AI Quotation Comparison
- Automatic Renewal
- Claim Management
- Survey / Risk Inspection
- Underwriting Engine
- Dynamic Workflow Engine
- Dynamic Product Configuration
- Multi-language
- Mobile Application
- BI / Advanced Analytics

---

# 4. User Roles

| Role | Description |
|---|---|
| ADMIN | System administrator |
| AGENT | Sales / Insurance Agent |
| BROKER_STAFF | Operation / Quotation / Policy staff |
| SUPERVISOR | Team supervisor |
| MANAGER | Manager / Approval |
| FINANCE | Payment / Commission |
| VIEWER | Read-only user |

## 4.1 Permission Examples

```text
customer.view
customer.create
customer.update

job.view
job.create
job.update
job.submit
job.assign
job.cancel

quotation.view
quotation.create
quotation.update
quotation.select

proposal.view
proposal.create
proposal.send
proposal.accept
proposal.reject

policy.view
policy.create
policy.update

payment.view
payment.create

commission.view
commission.create

report.view
master.manage
user.manage
approval.manage
```

---

# 5. High-Level Workflow

```text
Lead / Customer
      |
      v
Create Customer
      |
      v
Create Job
      |
      v
Enter Risk Information
      |
      v
Upload Required Documents
      |
      v
Submit Job
      |
      v
Request Quotation
      |
      v
Quotation Received
      |
      v
Compare Quotations
      |
      v
Select Quotation
      |
      v
Create Proposal
      |
      v
Send to Customer
      |
      +----------------------+
      |                      |
      v                      v
  Accepted                Rejected
      |                      |
      v                      v
  Approval                Closed/Lost
      |
      v
  Binding
      |
      v
  Policy Issued
      |
      +-----------+-----------+
      |           |           |
      v           v           v
   Payment    Commission   Renewal
```

---

# 6. Job Status

```text
DRAFT
OPEN
WAITING_INFORMATION
QUOTATION_REQUESTED
QUOTATION_RECEIVED
QUOTATION_SELECTED
PROPOSAL_SENT
WAITING_CUSTOMER
CUSTOMER_ACCEPTED
CUSTOMER_REJECTED
WAITING_APPROVAL
APPROVED
BINDING
POLICY_PENDING
POLICY_ISSUED
CANCELLED
CLOSED
EXPIRED
RENEWAL
```

## 6.1 Allowed Transitions

| Current | Allowed Next |
|---|---|
| DRAFT | OPEN |
| OPEN | WAITING_INFORMATION, QUOTATION_REQUESTED |
| WAITING_INFORMATION | OPEN |
| QUOTATION_REQUESTED | QUOTATION_RECEIVED |
| QUOTATION_RECEIVED | QUOTATION_SELECTED |
| QUOTATION_SELECTED | PROPOSAL_SENT |
| PROPOSAL_SENT | WAITING_CUSTOMER |
| WAITING_CUSTOMER | CUSTOMER_ACCEPTED, CUSTOMER_REJECTED |
| CUSTOMER_ACCEPTED | WAITING_APPROVAL, BINDING |
| WAITING_APPROVAL | APPROVED |
| APPROVED | BINDING |
| BINDING | POLICY_PENDING |
| POLICY_PENDING | POLICY_ISSUED |
| POLICY_ISSUED | RENEWAL, CLOSED |
| CUSTOMER_REJECTED | CLOSED |
| Any Open Status | CANCELLED |

> Backend ต้องตรวจสอบ State Transition ทุกครั้ง ไม่อนุญาตให้ Client เปลี่ยน Status โดยตรงเป็นค่าใดก็ได้

---

# 7. Customer Management

## 7.1 Customer Type

```text
INDIVIDUAL
CORPORATE
```

## 7.2 Customer Fields

```text
id
customer_code
customer_type
first_name
last_name
company_name
tax_id
citizen_id
phone
mobile
email
status
remark
created_by
updated_by
created_at
updated_at
deleted_at
```

## 7.3 Customer Address

รองรับหลาย Address

```text
id
customer_id
address_type
address_line
sub_district
district
province
postal_code
country
is_primary
created_at
updated_at
```

Address Type:

```text
HOME
OFFICE
BILLING
SHIPPING
OTHER
```

## 7.4 Customer Contact

```text
id
customer_id
contact_name
position
department
phone
mobile
email
is_primary
created_at
updated_at
```

---

# 8. Insurance Master Data

## 8.1 Insurance Type

```text
id
code
name
description
active
created_at
updated_at
```

Examples:

```text
MOTOR
PROPERTY
FIRE
MARINE
ENGINEERING
LIABILITY
PA
TRAVEL
CYBER
D_AND_O
OTHER
```

## 8.2 Insurance Product

```text
id
insurance_type_id
code
name
description
active
created_at
updated_at
```

Example:

```text
MOTOR-001
FIRE-001
PROPERTY-001
```

## 8.3 Insurance Company

```text
id
code
name
tax_id
contact_name
phone
email
address
status
created_at
updated_at
deleted_at
```

---

# 9. Insurance Job

## 9.1 Job Fields

```text
id
job_no
customer_id
insurance_type_id
product_id
agent_id
assigned_to
department_id
source
priority
status
effective_date
expiry_date
remark
created_by
updated_by
created_at
updated_at
deleted_at
```

## 9.2 Job Number

Format:

```text
JOB-{YEAR}-{RUNNING}
```

Example:

```text
JOB-2026-000001
```

Job Number ต้อง Unique

---

# 10. Job Risk

Risk information แตกต่างกันตาม Product จึงไม่ควรออกแบบทุก Field เป็น Column ใน jobs

## 10.1 Recommended Structure

```text
job_risks
job_risk_values
risk_field_definitions
```

### risk_field_definitions

```text
id
product_id
field_code
field_name
field_type
is_required
validation_rule
sort_order
active
```

Field Type:

```text
TEXT
NUMBER
DATE
BOOLEAN
SELECT
MULTI_SELECT
FILE
JSON
```

### job_risk_values

```text
id
job_id
risk_field_definition_id
value_text
value_number
value_date
value_boolean
value_json
```

## 10.2 Motor Example

```text
brand
model
year
license_plate
engine_no
chassis_no
vehicle_type
usage_type
sum_insured
```

## 10.3 Property Example

```text
building_type
construction_type
location
occupancy
building_value
content_value
stock_value
machinery_value
```

---

# 11. Coverage

## 11.1 Coverage Master

```text
id
product_id
code
name
description
default_sum_insured
active
```

## 11.2 Job Coverage

```text
id
job_id
coverage_id
sum_insured
deductible
rate
premium
remark
```

---

# 12. Document Management

## 12.1 Document

```text
id
job_id
document_type
file_name
file_path
mime_type
file_size
version
status
uploaded_by
uploaded_at
```

Document Type:

```text
ID_CARD
COMPANY_REGISTRATION
TAX_DOCUMENT
VEHICLE_BOOK
PREVIOUS_POLICY
VEHICLE_PHOTO
RISK_SURVEY
QUOTATION
PROPOSAL
POLICY
INVOICE
RECEIPT
OTHER
```

## 12.2 Document Checklist

```text
id
product_id
document_type
is_required
sort_order
active
```

## 12.3 Document Validation

Job ต้องสามารถแสดง:

```text
Required Documents: 5
Uploaded: 3
Missing: 2
```

หากเอกสาร Required ยังไม่ครบ ให้กำหนด Rule ว่าไม่สามารถ Submit / Bind ได้ตาม Product Configuration

---

# 13. Quotation

## 13.1 Quotation

```text
id
quotation_no
job_id
insurance_company_id
quotation_date
valid_until
status
gross_premium
discount
net_premium
tax
stamp_duty
total_amount
remark
created_by
updated_by
created_at
updated_at
```

Quotation Status:

```text
DRAFT
REQUESTED
RECEIVED
SELECTED
REJECTED
EXPIRED
CANCELLED
```

## 13.2 Quotation Item

```text
id
quotation_id
coverage_id
coverage_name
sum_insured
rate
deductible
premium
remark
```

## 13.3 Relationship

```text
1 Job
  |
  +--- Quotation A
  |      +--- Items
  |
  +--- Quotation B
  |      +--- Items
  |
  +--- Quotation C
         +--- Items
```

---

# 14. Quotation Comparison

ระบบต้องสามารถเปรียบเทียบ Quotation หลายบริษัท

ตัวอย่าง:

| Coverage | Company A | Company B | Company C |
|---|---:|---:|---:|
| Sum Insured | 10M | 10M | 10M |
| Liability | 5M | 5M | 10M |
| Deductible | 50K | 30K | 50K |
| Premium | 50K | 55K | 52K |

ระบบต้องสามารถ:

- เลือก Quotation
- เปรียบเทียบ Coverage
- เปรียบเทียบ Premium
- แสดง Deductible
- แสดงเงื่อนไข
- บันทึกเหตุผลการเลือก

---

# 15. Proposal

## 15.1 Proposal

```text
id
proposal_no
job_id
quotation_id
customer_id
proposal_date
valid_until
status
sent_at
accepted_at
rejected_at
reject_reason
remark
created_by
created_at
updated_at
```

Status:

```text
DRAFT
SENT
VIEWED
ACCEPTED
REJECTED
EXPIRED
```

## 15.2 Reject Reason

```text
PRICE
COVERAGE
COMPETITOR
CUSTOMER_CANCELLED
NO_RESPONSE
OTHER
```

---

# 16. Approval

## 16.1 Approval Request

```text
id
job_id
approval_type
requested_by
approver_id
status
requested_at
approved_at
rejected_at
reason
remark
```

Status:

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

## 16.2 Example Rules

```text
Premium < 100,000
→ Supervisor Approval

Premium >= 100,000
→ Manager Approval

Discount > 10%
→ Manager Approval
```

> Rule ควรทำเป็น Configuration ในอนาคต ไม่ควร Hard Code ใน Controller

---

# 17. Binding

## 17.1 Binding Fields

```text
id
job_id
quotation_id
binding_date
effective_date
expiry_date
confirmed_by
remark
created_at
updated_at
```

Business Rules:

- ต้องมี Selected Quotation
- Customer ต้อง Accept Proposal
- Required Documents ต้องครบ
- Approval ต้องผ่าน ถ้า Product/Rule กำหนด
- Binding ต้องสร้าง Audit Log

---

# 18. Policy

## 18.1 Policy

```text
id
policy_no
job_id
quotation_id
insurance_company_id
policy_type
effective_date
expiry_date
sum_insured
gross_premium
discount
net_premium
tax
stamp_duty
total_premium
status
issued_at
created_at
updated_at
```

Status:

```text
PENDING
ISSUED
ACTIVE
CANCELLED
EXPIRED
RENEWED
```

Policy Number ต้อง Unique

---

# 19. Payment

## 19.1 Payment

```text
id
policy_id
payment_no
payment_date
amount
payment_method
reference_no
status
remark
created_by
created_at
updated_at
```

Payment Method:

```text
CASH
TRANSFER
CREDIT_CARD
CHEQUE
ONLINE
OTHER
```

Payment Status:

```text
UNPAID
PARTIAL
PAID
OVERDUE
CANCELLED
```

## 19.2 Payment Rule

```text
Total Paid >= Total Premium
→ PAID

Total Paid > 0 AND Total Paid < Total Premium
→ PARTIAL

Due Date < Current Date AND Outstanding > 0
→ OVERDUE
```

---

# 20. Commission

## 20.1 Commission

```text
id
policy_id
agent_id
commission_type
commission_rate
commission_base
commission_amount
status
paid_date
remark
created_at
updated_at
```

Commission Type:

```text
COMPANY
AGENT
TEAM
REFERRAL
OTHER
```

Status:

```text
PENDING
CALCULATED
APPROVED
PAID
CANCELLED
```

Calculation:

```text
commission_amount =
commission_base * commission_rate / 100
```

---

# 21. Task / Follow-up

## 21.1 Task

```text
id
job_id
assigned_to
task_type
subject
description
due_date
priority
status
completed_at
created_at
updated_at
```

Task Type:

```text
CALL_CUSTOMER
REQUEST_DOCUMENT
REQUEST_QUOTATION
FOLLOW_UP_QUOTATION
SEND_PROPOSAL
FOLLOW_UP_CUSTOMER
FOLLOW_UP_PAYMENT
FOLLOW_UP_POLICY
RENEWAL
OTHER
```

Priority:

```text
LOW
MEDIUM
HIGH
URGENT
```

Status:

```text
TODO
IN_PROGRESS
DONE
CANCELLED
```

---

# 22. Activity Log / Audit Trail

## 22.1 Activity Log

```text
id
job_id
user_id
action
entity_type
entity_id
old_value
new_value
description
ip_address
user_agent
created_at
```

ตัวอย่าง:

```text
User: Agent A
Action: STATUS_CHANGED

Old:
QUOTATION_RECEIVED

New:
QUOTATION_SELECTED

Time:
2026-09-26 10:30:00
```

Transaction สำคัญที่ต้อง Log:

- Create Job
- Update Job
- Change Status
- Assign Job
- Add Quotation
- Select Quotation
- Send Proposal
- Customer Accept
- Customer Reject
- Approval
- Binding
- Issue Policy
- Payment
- Commission

---

# 23. Renewal

## 23.1 Renewal

```text
id
previous_policy_id
new_job_id
renewal_date
target_expiry_date
status
assigned_to
remark
created_at
updated_at
```

Status:

```text
PENDING
IN_PROGRESS
QUOTATION
CUSTOMER_CONTACTED
ACCEPTED
REJECTED
RENEWED
LOST
CANCELLED
```

## 23.2 Renewal Timeline

```text
Policy Expiry
     |
     +-- 90 Days → Prepare Renewal
     |
     +-- 60 Days → Request Quotation
     |
     +-- 30 Days → Contact Customer
     |
     +-- 7 Days  → Urgent Follow-up
     |
     +-- Expiry → Expired / Renewed
```

---

# 24. Notification

## 24.1 Notification

```text
id
user_id
type
title
message
entity_type
entity_id
is_read
read_at
created_at
```

Notification Types:

```text
JOB_ASSIGNED
DOCUMENT_MISSING
QUOTATION_RECEIVED
APPROVAL_REQUIRED
PROPOSAL_SENT
CUSTOMER_ACCEPTED
POLICY_ISSUED
PAYMENT_OVERDUE
TASK_DUE
RENEWAL_DUE
```

---

# 25. Dashboard

## 25.1 Agent Dashboard

```text
My Jobs
Open Jobs
Waiting Information
Quotation
Waiting Customer
Binding
Policy Issued
Renewal
Overdue Tasks
```

## 25.2 Manager Dashboard

```text
Total Jobs
Jobs by Status
Jobs by Agent
Premium
Commission
Conversion
Renewal
Overdue
```

## 25.3 Sales Funnel

```text
Lead
 ↓
Job
 ↓
Quotation
 ↓
Proposal
 ↓
Accepted
 ↓
Policy
```

Metrics:

```text
Quotation Conversion
Proposal Conversion
Policy Conversion
Premium
Average Premium
```

---

# 26. Search & Filter

ระบบต้องรองรับ Search จาก:

```text
Job No
Customer Code
Customer Name
Policy No
Quotation No
Vehicle Plate
Insurance Company
Agent
Insurance Type
Status
Effective Date
Expiry Date
```

Filters:

```text
Date Range
Agent
Department
Insurance Type
Product
Insurance Company
Status
Priority
```

---

# 27. Excel

## 27.1 Import

MVP:

```text
Customer
Customer Address
Motor Risk
Job
```

## 27.2 Export

```text
Job Report
Quotation Report
Policy Report
Payment Report
Commission Report
Renewal Report
```

Import ต้องมี Validation และ Error Report

ตัวอย่าง:

```text
Row 5:
Invalid Customer Type

Row 8:
Missing Insurance Type

Row 10:
Invalid Effective Date
```

---

# 28. LINE OA - Future

Customer สามารถ:

```text
ตรวจสอบ Job Status
ส่งเอกสาร
รับ Proposal
ยืนยันการซื้อ
ตรวจสอบ Policy
แจ้งเตือน Payment
แจ้งเตือน Renewal
```

ตัวอย่าง:

```text
JOB-2026-000123

Status:
Waiting Documents

Missing:
- ID Card
- Vehicle Registration
```

---

# 29. REST API

## 29.1 Auth

```http
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
GET  /api/auth/me
```

## 29.2 Customers

```http
GET    /api/customers
POST   /api/customers
GET    /api/customers/{id}
PUT    /api/customers/{id}
DELETE /api/customers/{id}
```

## 29.3 Jobs

```http
GET    /api/jobs
POST   /api/jobs
GET    /api/jobs/{id}
PUT    /api/jobs/{id}
POST   /api/jobs/{id}/submit
POST   /api/jobs/{id}/assign
POST   /api/jobs/{id}/cancel
GET    /api/jobs/{id}/activities
```

## 29.4 Risk

```http
GET  /api/jobs/{jobId}/risk
PUT  /api/jobs/{jobId}/risk
```

## 29.5 Documents

```http
GET  /api/jobs/{jobId}/documents
POST /api/jobs/{jobId}/documents
DELETE /api/documents/{id}
```

## 29.6 Quotations

```http
GET  /api/jobs/{jobId}/quotations
POST /api/jobs/{jobId}/quotations
GET  /api/quotations/{id}
PUT  /api/quotations/{id}
POST /api/quotations/{id}/select
```

## 29.7 Proposal

```http
POST /api/jobs/{jobId}/proposal
POST /api/proposals/{id}/send
POST /api/proposals/{id}/accept
POST /api/proposals/{id}/reject
```

## 29.8 Approval

```http
POST /api/jobs/{jobId}/approval
GET  /api/approvals
POST /api/approvals/{id}/approve
POST /api/approvals/{id}/reject
```

## 29.9 Binding

```http
POST /api/jobs/{jobId}/bind
```

## 29.10 Policy

```http
GET  /api/policies
GET  /api/policies/{id}
POST /api/jobs/{jobId}/policy
PUT  /api/policies/{id}
```

## 29.11 Payment

```http
GET  /api/policies/{policyId}/payments
POST /api/policies/{policyId}/payments
```

## 29.12 Commission

```http
GET  /api/commissions
POST /api/policies/{policyId}/commission
```

## 29.13 Renewal

```http
GET  /api/renewals
POST /api/policies/{policyId}/renew
```

---

# 30. API Response Standard

## Success

```json
{
  "success": true,
  "data": {},
  "message": "Success"
}
```

## List

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 100,
    "last_page": 5
  }
}
```

## Error

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "customer_id": [
      "The customer field is required."
    ]
  }
}
```

HTTP Status:

```text
200 OK
201 Created
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
500 Internal Server Error
```

---

# 31. Database Tables

Core tables:

```text
users
roles
permissions
user_roles
role_permissions

customers
customer_contacts
customer_addresses

insurance_types
insurance_products
insurance_companies
insurance_coverages

risk_field_definitions
job_risks
job_risk_values

jobs
job_coverages

documents
document_checklists

quotations
quotation_items

proposals
approvals
bindings

policies
policy_coverages

payments
commissions

tasks
renewals

notifications
activity_logs
```

---

# 32. Main Relationships

```text
customers
    |
    +----< jobs
              |
              +----< job_risks
              |
              +----< job_coverages
              |
              +----< documents
              |
              +----< tasks
              |
              +----< quotations
              |         |
              |         +----< quotation_items
              |
              +----< proposals
              |
              +----< approvals
              |
              +----< bindings
              |
              +----< policies
                        |
                        +----< payments
                        |
                        +----< commissions
                        |
                        +----< renewals
```

---

# 33. Core Business Rules

## BR-001 Customer

Customer Code ต้อง Unique

## BR-002 Job

Job Number ต้อง Unique

## BR-003 Quotation

Quotation ต้องผูกกับ Job

## BR-004 Multiple Quotations

Job เดียวสามารถมีหลาย Quotations

## BR-005 Select Quotation

Job สามารถมี Selected Quotation หลักได้ 1 รายการ

## BR-006 Proposal

Proposal ต้องอ้างอิง Quotation ที่ถูกเลือก

## BR-007 Accept

Customer ต้อง Accept ก่อน Binding

## BR-008 Required Documents

Required Documents ต้องครบก่อน Binding หาก Product กำหนด

## BR-009 Approval

ถ้าเข้าเงื่อนไข Approval ต้อง Approved ก่อน Binding

## BR-010 Policy

Policy ต้องอ้างอิง Job และ Selected Quotation

## BR-011 Payment

Payment รวมต้องไม่เกินยอดที่ระบบอนุญาต เว้นแต่มี Adjustment / Overpayment Rule

## BR-012 Audit

Transaction สำคัญต้องสร้าง Activity Log

## BR-013 Renewal

Renewal ต้องอ้างอิง Previous Policy

## BR-014 Authorization

Agent ต้องไม่สามารถแก้ไข Job ของ Agent อื่น หากไม่มี Permission

---

# 34. Validation

## Customer

```text
customer_type: required
name/company_name: required
phone: valid format
email: valid email if provided
tax_id: validate format
```

## Job

```text
customer_id: required
insurance_type_id: required
product_id: required
agent_id: required
effective_date: required
```

## Quotation

```text
insurance_company_id: required
quotation_date: required
valid_until: required
total_amount >= 0
```

## Policy

```text
policy_no: required + unique
effective_date: required
expiry_date > effective_date
total_premium >= 0
```

---

# 35. Security

## Authentication

แนะนำ:

```text
Access Token
Refresh Token
```

## Authorization

RBAC

```text
User
 ↓
Role
 ↓
Permission
```

## Security Requirements

- Password Hashing
- HTTPS
- Rate Limit Login
- Request Validation
- SQL Injection Protection
- XSS Protection
- CSRF Protection ตาม Authentication Architecture
- File Upload Validation
- File Size Limit
- MIME Type Validation
- Authorization ทุก Endpoint
- Audit Log
- Sensitive Data Masking
- Secret ไม่เก็บใน Source Code

---

# 36. File Upload Rules

Allowed example:

```text
PDF
JPG
JPEG
PNG
XLSX
DOCX
```

ต้องกำหนด:

```text
Max File Size
Allowed MIME Type
Allowed Extension
Storage Location
File Naming
Virus Scan (Future)
```

ห้ามใช้ชื่อไฟล์จาก User เป็น Path โดยตรง

---

# 37. Frontend Pages

## Authentication

```text
/login
```

## Dashboard

```text
/dashboard
```

## Customer

```text
/customers
/customers/create
/customers/{id}
/customers/{id}/edit
```

## Jobs

```text
/jobs
/jobs/create
/jobs/{id}
/jobs/{id}/edit
/jobs/{id}/quotation
/jobs/{id}/proposal
/jobs/{id}/documents
/jobs/{id}/timeline
```

## Quotations

```text
/quotations
/quotations/{id}
/jobs/{jobId}/quotation-comparison
```

## Policies

```text
/policies
/policies/{id}
```

## Payments

```text
/payments
```

## Commission

```text
/commissions
```

## Renewal

```text
/renewals
```

## Master Data

```text
/master/insurance-types
/master/products
/master/insurance-companies
/master/coverages
/master/risk-fields
```

---

# 38. Job Detail UI

แนะนำให้ใช้ Tab

```text
Job Information
Customer
Risk
Coverage
Documents
Quotations
Comparison
Proposal
Approval
Binding
Policy
Payment
Commission
Tasks
Activity Timeline
```

ตัวอย่าง:

```text
┌──────────────────────────────────────────────┐
│ JOB-2026-000001              [OPEN]          │
├──────────────────────────────────────────────┤
│ Customer: ABC Company                        │
│ Product : Property Insurance                 │
│ Agent   : John                               │
├──────────────────────────────────────────────┤
│ [Info] [Risk] [Documents] [Quotation]        │
│ [Proposal] [Policy] [Payment] [Timeline]     │
└──────────────────────────────────────────────┘
```

---

# 39. Development Architecture

สามารถเลือก Stack ได้ตามทีม แต่สำหรับระบบลักษณะนี้แนะนำ:

## Option A

```text
Frontend
Next.js / React
TypeScript
Tailwind CSS

Backend
Laravel
REST API

Database
PostgreSQL / MySQL

Cache
Redis

Queue
Redis Queue

Storage
S3 Compatible Storage

CI/CD
Docker
GitHub Actions / Jenkins
```

## Option B

```text
Frontend
Angular
TypeScript

Backend
NestJS
TypeScript

Database
PostgreSQL

Redis
Queue

Docker
CI/CD
```

สำหรับระบบ Enterprise ที่มี Workflow และ Business Logic จำนวนมาก ควรแยก Domain/Service Layer ออกจาก Controller

---

# 40. Backend Layer

แนะนำ:

```text
Controller
    |
    v
Request Validation
    |
    v
Application Service
    |
    v
Domain / Business Logic
    |
    v
Repository
    |
    v
Database
```

ไม่ควรเขียน Business Logic จำนวนมากไว้ใน Controller

---

# 41. Transaction

Operation สำคัญควรใช้ Database Transaction

ตัวอย่าง:

```text
Accept Proposal
    |
    BEGIN TRANSACTION
    |
    Update Proposal
    |
    Update Job Status
    |
    Create Activity Log
    |
    Create Approval if required
    |
    COMMIT
```

ถ้าขั้นตอนใดล้มเหลว:

```text
ROLLBACK
```

---

# 42. Concurrency

ต้องป้องกันกรณี User 2 คนทำงาน Job เดียวกันพร้อมกัน

ตัวอย่าง:

```text
Agent A selects quotation
Agent B selects quotation
```

ต้องใช้:

- Database transaction
- Row locking / optimistic locking
- Unique constraints
- Server-side validation

---

# 43. MVP Development Order

## Sprint 1

```text
Authentication
User
Role
Permission
Customer
Master Data
```

## Sprint 2

```text
Job
Risk
Coverage
Document
Job Status
Activity Log
```

## Sprint 3

```text
Quotation
Quotation Item
Quotation Comparison
```

## Sprint 4

```text
Proposal
Approval
Binding
Policy
```

## Sprint 5

```text
Payment
Commission
Task
Dashboard
```

## Sprint 6

```text
Renewal
Excel Import/Export
Notification
Hardening
Testing
```

---

# 44. Testing Requirements

## Unit Test

ต้อง Test:

```text
Job Status Transition
Premium Calculation
Commission Calculation
Payment Status
Renewal Calculation
Approval Rule
Document Validation
Permission
```

## Feature / Integration Test

ตัวอย่าง:

```text
Create Customer
→ Create Job
→ Add Risk
→ Add Quotation
→ Select Quotation
→ Create Proposal
→ Accept
→ Approval
→ Binding
→ Issue Policy
```

## Negative Test

ต้อง Test:

```text
Unauthorized User
Invalid Status Transition
Missing Required Document
Missing Required Risk
Expired Quotation
Expired Proposal
Duplicate Policy Number
Invalid Payment
Invalid Commission
```

---

# 45. Definition of Done - MVP

Feature ถือว่า Done เมื่อ:

- API ทำงาน
- Validation ครบ
- Authorization ครบ
- Database Constraint ครบ
- Unit Test ผ่าน
- Integration Test ผ่าน
- Error Handling ครบ
- Activity Log ถูกสร้าง
- UI สามารถใช้งานจริง
- Loading / Empty / Error State มี
- Audit สำคัญครบ
- API Documentation ครบ

---

# 46. Recommended V1 Product

เพื่อไม่ให้ Scope ใหญ่เกินไป แนะนำให้ MVP เริ่มจาก:

```text
Product 1:
Motor Insurance

Product 2:
Property / Fire Insurance
```

เหตุผลคือสอง Product นี้ทำให้ระบบต้องรองรับ Risk Structure ที่แตกต่างกัน และช่วยพิสูจน์ว่า Dynamic Risk / Product Configuration ออกแบบมาถูกต้อง

ตัวอย่าง:

```text
Motor
 ├── Brand
 ├── Model
 ├── Year
 ├── Plate
 ├── Chassis
 └── Sum Insured

Property
 ├── Location
 ├── Building Type
 ├── Construction
 ├── Occupancy
 ├── Building Value
 └── Content Value
```

---

# 47. V1 Acceptance Flow

ตัวอย่าง End-to-End ที่ต้องทำงานได้:

```text
1. Login
2. Create Customer
3. Create Job
4. Select Insurance Type
5. Select Product
6. Fill Risk Information
7. Add Coverage
8. Upload Documents
9. Submit Job
10. Request Quotation
11. Add Company A
12. Add Company B
13. Record Quotations
14. Compare Quotations
15. Select Quotation
16. Create Proposal
17. Send Proposal
18. Customer Accept
19. Approval if required
20. Binding
21. Create Policy
22. Record Payment
23. Calculate Commission
24. Schedule Renewal
25. Show Activity Timeline
```

---

# 48. Future Architecture Direction

เมื่อระบบโตขึ้น สามารถแยก Domain:

```text
Customer Domain
Job Domain
Quotation Domain
Policy Domain
Payment Domain
Commission Domain
Renewal Domain
Notification Domain
Document Domain
Workflow Domain
```

แต่ V1 ไม่จำเป็นต้องทำ Microservices

แนะนำเริ่มจาก:

```text
Modular Monolith
```

แล้วแบ่ง Module ให้ชัดเจน

```text
modules/
├── Auth
├── Customer
├── Job
├── Product
├── Quotation
├── Proposal
├── Approval
├── Policy
├── Payment
├── Commission
├── Renewal
├── Document
├── Notification
└── Reporting
```

---

# 49. Development Priorities

ลำดับความสำคัญ:

```text
P0
Authentication
Customer
Job
Risk
Quotation
Policy

P1
Document
Proposal
Approval
Payment
Commission

P2
Dashboard
Task
Renewal
Excel

P3
LINE OA
Customer Portal
AI
OCR
Advanced Analytics
```

---

# 50. Final MVP Architecture

```text
                    ┌───────────────┐
                    │    Frontend   │
                    │ React/Angular │
                    └───────┬───────┘
                            │ REST API
                            ▼
                    ┌───────────────┐
                    │   API Layer   │
                    ├───────────────┤
                    │ Auth          │
                    │ Customer      │
                    │ Job           │
                    │ Quotation     │
                    │ Proposal      │
                    │ Policy        │
                    │ Payment       │
                    │ Commission    │
                    │ Renewal       │
                    └───────┬───────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        PostgreSQL        Redis        File Storage
             │
             ▼
        Audit / Logs
```

---

# 51. Important Implementation Notes

1. อย่าให้ Frontend เป็นผู้กำหนด Business Status โดยตรง
2. Business Rule ต้องอยู่ Backend
3. อย่าเก็บ Risk Fields ของทุก Product เป็น Column ใน `jobs`
4. อย่าผูก Quotation แบบ 1:1 กับ Job
5. อย่าผูก Policy แบบตรงกับ Customer โดยไม่มี Job
6. เก็บ Historical Data ของ Quotation และ Policy
7. อย่าลบ Transaction ด้วย Physical Delete
8. ใช้ Database Transaction กับ State-changing Operations
9. ใช้ Unique Constraint กับ Job No / Policy No / Quotation No
10. ทุกไฟล์ต้องมี Metadata
11. ทุก Status Change สำคัญต้องมี Audit
12. Permission ต้องตรวจสอบที่ Backend
13. รองรับ Timezone `Asia/Bangkok`
14. วันที่ใน Database ควรเก็บเป็นมาตรฐานเดียวกัน และแปลงที่ Presentation Layer
15. Monetary values ควรใช้ Decimal ไม่ใช้ Float
16. Rate / Percentage ควรกำหนด Precision ให้ชัดเจน
17. รองรับ Pagination ใน List API
18. รองรับ Sorting / Filtering
19. ใช้ Idempotency กับ Operation ที่อาจถูกเรียกซ้ำ เช่น Payment / Binding
20. ทุก API ต้องมี Error Response Format เดียวกัน

---

# 52. Next Development Documents

หลังจากเอกสารนี้ สามารถแตกออกเป็น:

```text
01_REQUIREMENT.md
02_USE_CASE.md
03_DATABASE_ERD.md
04_DATABASE_SCHEMA.md
05_API_SPECIFICATION.md
06_BUSINESS_RULE.md
07_WORKFLOW.md
08_UI_SPECIFICATION.md
09_EXCEL_TEMPLATE.md
10_LINE_OA_FLOW.md
11_TEST_CASE.md
12_AI_CODING_GUIDE.md
```

เอกสารชุดนี้ถือเป็น **System Requirement / Functional Specification V1** และสามารถใช้เป็นฐานสำหรับเริ่มออกแบบ Database และพัฒนา API ได้
