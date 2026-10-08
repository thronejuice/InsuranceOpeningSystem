# Insurance Broker System — Workflow V2

> Version: 2.0  
> Purpose: ใช้เป็น Functional / Workflow Specification สำหรับพัฒนาระบบตัวแทน/นายหน้าประกันภัยต่อจาก V1  
> Scope: Customer → Job → Risk → Quotation → Proposal → Approval → Binding → Policy → Payment → Commission → Endorsement → Claim → Renewal

---

# 1. เป้าหมาย V2

V1 มี Core Flow สำหรับ New Business ครบในระดับ MVP:

```text
Customer
  ↓
Job
  ↓
Risk
  ↓
Coverage
  ↓
Document
  ↓
Quotation
  ↓
Proposal
  ↓
Customer Acceptance
  ↓
Approval
  ↓
Binding
  ↓
Policy
  ↓
Payment
  ↓
Commission
  ↓
Renewal
```

V2 มีเป้าหมายให้ระบบรองรับงาน Broker ที่ใกล้เคียงการใช้งานจริงมากขึ้น โดยเฉพาะ:

- Underwriting / Risk Assessment
- Quotation Version / Expiry
- Customer Acceptance Evidence
- Approval Reject / Resubmit
- Binding Lifecycle
- Invoice / Receipt / AR
- Payment Status / Outstanding
- Commission Statement / Adjustment
- Endorsement
- Cancellation / Refund
- Renewal Pipeline
- Claim
- Task / Follow-up
- Notification
- Audit Log
- Master Data

---

# 2. หลักการออกแบบ V2

## 2.1 ห้ามใช้ Job Status เป็นสถานะของทุก Module

ให้แยกสถานะตาม Domain:

```text
Job
├── Job Status
├── Quotation Status
├── Underwriting Status
├── Approval Status
├── Binding Status
├── Policy Status
├── Payment Status
├── Commission Status
├── Endorsement Status
├── Claim Status
└── Renewal Status
```

เหตุผล:

ไม่ควรสร้าง Job Status จำนวนมาก เช่น:

```text
WAITING_PAYMENT
WAITING_ENDORSEMENT
WAITING_REFUND
WAITING_CLAIM
WAITING_COMMISSION
```

เพราะจะทำให้ State Machine ของ Job ซับซ้อนและแก้ไขยาก

---

# 3. Core Job Status

Job Status ใช้บอกสถานะหลักของงานเท่านั้น

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
APPROVAL_REJECTED
APPROVED
BINDING
POLICY_PENDING
POLICY_ISSUED
CLOSED
CANCELLED
EXPIRED
RENEWAL
```

## 3.1 Recommended Transition

```text
DRAFT
  ↓ submit
OPEN
  ↓ request quotation
QUOTATION_REQUESTED
  ↓ quotation received
QUOTATION_RECEIVED
  ↓ select
QUOTATION_SELECTED
  ↓ send proposal
WAITING_CUSTOMER
  ├── accept → CUSTOMER_ACCEPTED
  └── reject → CUSTOMER_REJECTED → CLOSED

CUSTOMER_ACCEPTED
  ↓ approval required
WAITING_APPROVAL
  ├── approve → APPROVED
  └── reject → APPROVAL_REJECTED
                    ↓
                แก้ไข/Resubmit
                    ↓
              WAITING_APPROVAL

APPROVED
  ↓ bind
BINDING
  ↓
POLICY_PENDING
  ↓ issue
POLICY_ISSUED
  ↓
CLOSED
```

> หมายเหตุ: Policy lifecycle ไม่ควรผูกกับ Job lifecycle ทั้งหมด

---

# 4. Customer Module

## 4.1 Customer

รองรับ:

```text
INDIVIDUAL
CORPORATE
```

ข้อมูลหลัก:

```text
Customer ID
Customer Type
Name / Company Name
Tax ID / Citizen ID
Email
Phone
Address
Status
Created At
Updated At
```

## 4.2 Customer Contact

Corporate สามารถมีหลาย Contact:

```text
Contact
- Name
- Position
- Email
- Phone
- Is Primary
```

## 4.3 Customer Address

รองรับหลาย Address:

```text
REGISTERED
BILLING
RISK_LOCATION
MAILING
```

---

# 5. Job Module

Job เป็นตัวแทนของงานประกันหนึ่งงาน

ข้อมูล:

```text
Job ID
Job Number
Customer ID
Agent ID
Broker Staff ID
Insurance Type
Product
Requested Effective Date
Job Status
Priority
Source
Created At
Updated At
```

## 5.1 Job Assignment

รองรับ:

```text
Agent
Broker Staff
Manager
```

ควรสามารถ Reassign งานได้

ต้องเก็บ History:

```text
From User
To User
Reason
Changed By
Changed At
```

---

# 6. Risk Information

Risk เป็นข้อมูลเฉพาะของประเภทประกัน

ตัวอย่าง:

### Motor

```text
Vehicle Type
Brand
Model
Year
Registration
Chassis
Engine
Sum Insured
Usage
Driver Information
```

### Fire

```text
Building Type
Construction
Area
Risk Location
Property Value
Contents Value
Business Type
```

### Cyber

```text
Company Size
Annual Revenue
Industry
IT Systems
Data Volume
Security Controls
Previous Incident
```

ควรออกแบบให้ Risk เป็น Dynamic ตาม Product / Insurance Type

---

# 7. Underwriting Module

## 7.1 Purpose

ประเมินความเสี่ยงก่อนขอ/เลือก Quotation

Flow:

```text
Risk Information
      ↓
Underwriting Review
      ↓
 ┌───────────────┬────────────────┬────────────────┐
 ↓               ↓                ↓
APPROVED     INFO_REQUIRED     REJECTED
                  ↓
              Update Risk
                  ↓
              Re-review
```

## 7.2 Underwriting Status

```text
PENDING
INFO_REQUIRED
APPROVED
REJECTED
```

## 7.3 Underwriting Data

```text
Risk Score
Underwriter
Decision
Reason
Condition
Exclusion
Deductible
Required Survey
Required Document
Reviewed At
```

---

# 8. Document Module

Document ต้องรองรับ:

```text
Document Checklist
Document Upload
Document Version
Document Verification
Document Expiry
Required Document
Optional Document
```

## 8.1 Document Status

```text
REQUIRED
UPLOADED
UNDER_REVIEW
VERIFIED
REJECTED
EXPIRED
```

## 8.2 Document Metadata

```text
Document ID
Document Type
File Name
Version
Uploaded By
Uploaded At
Verified By
Verified At
Expiry Date
Remark
```

---

# 9. Quotation Module

Quotation สามารถมีหลาย Insurer

```text
Job
 ├── Quotation A
 ├── Quotation B
 └── Quotation C
```

## 9.1 Quotation Version

แต่ละ Insurer ต้องรองรับหลาย Version:

```text
Quotation A
 ├── V1
 ├── V2
 └── V3
```

เมื่อมีการเปลี่ยน Premium / Coverage / Condition ให้สร้าง Version ใหม่ ไม่ควร overwrite ข้อมูลเดิม

## 9.2 Quotation Fields

```text
Quotation Number
Insurer
Product
Version
Quotation Date
Valid Until
Net Premium
Tax
Stamp Duty
Gross Premium
Commission Rate
Commission Amount
Deductible
Coverage
Exclusion
Special Condition
Insurer Reference
Underwriter
Attachment
Remark
```

## 9.3 Quotation Status

```text
REQUESTED
RECEIVED
ACTIVE
EXPIRED
WITHDRAWN
SELECTED
REJECTED
```

## 9.4 Quotation Expiry

ระบบต้องตรวจ:

```text
valid_until < current_date
```

แล้วเปลี่ยนเป็น:

```text
EXPIRED
```

ไม่อนุญาตให้เลือก Quotation ที่หมดอายุ

---

# 10. Quotation Comparison

ต้องสามารถเปรียบเทียบ:

```text
Insurer
Premium
Coverage
Limit
Deductible
Exclusion
Condition
Commission
Validity
```

ตัวอย่าง:

```text
                A        B        C
Premium         50K      55K      48K
Deductible      10K      20K      50K
Coverage        10M      10M       8M
Commission      15%      18%      12%
```

สามารถเลือก Quotation ที่นำเสนอลูกค้าได้ 1 รายการต่อ Proposal

---

# 11. Proposal Module

Proposal ต้องมี Version:

```text
Proposal V1
Proposal V2
Proposal V3
```

ข้อมูล:

```text
Proposal Number
Version
Quotation ID
Customer
Coverage Summary
Premium
Effective Date
Expiry Date
Terms
Conditions
Created By
Created At
```

---

# 12. Customer Acceptance

เมื่อส่ง Proposal:

```text
PROPOSAL_SENT
      ↓
WAITING_CUSTOMER
```

รองรับ:

```text
ACCEPTED
REJECTED
EXPIRED
```

## 12.1 Acceptance Evidence

ต้องเก็บ:

```text
Proposal Version
Accepted By
Accepted At
Acceptance Method
IP Address
Evidence File
Remark
```

Acceptance Method ตัวอย่าง:

```text
PORTAL
EMAIL
SIGNED_DOCUMENT
LINE
MANUAL
```

---

# 13. Approval Module

Approval Rule กำหนด:

```text
Product
Premium Threshold
Insurance Type
Risk Level
Role
Approval Level
```

## 13.1 Approval Status

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

## 13.2 Maker-Checker

ผู้ขออนุมัติไม่ควรอนุมัติงานตัวเอง

ยกเว้นสิทธิ์:

```text
approval.approve_own
```

## 13.3 Reject / Resubmit

```text
WAITING_APPROVAL
      ↓
REJECTED
      ↓
แก้ไขข้อมูล
      ↓
RESUBMIT
      ↓
WAITING_APPROVAL
```

ต้องเก็บ:

```text
Reject Reason
Comment
Rejected By
Rejected At
Resubmitted By
Resubmitted At
```

---

# 14. Binding Module

Binding เป็นขั้นตอนยืนยันการรับประกันก่อน Policy ออก

## 14.1 Binding Status

```text
PENDING
SUBMITTED
CONFIRMED
REJECTED
CANCELLED
```

## 14.2 Binding Data

```text
Binder Number
Binder Date
Insurer
Effective Date
Premium
Payment Condition
Underwriter
Binder Document
Remark
```

Flow:

```text
APPROVED
   ↓
BINDING
   ↓
POLICY_PENDING
```

---

# 15. Policy Module

Policy lifecycle แยกจาก Job

```text
DRAFT
PENDING
ACTIVE
EXPIRING
EXPIRED
CANCEL_REQUESTED
CANCELLED
```

เมื่อ Issue:

```text
POLICY_PENDING
      ↓
POLICY_ISSUED
```

ข้อมูล:

```text
Policy Number
Insurer
Product
Customer
Effective Date
Expiry Date
Premium
Sum Insured
Coverage
Deductible
Policy Document
```

---

# 16. Payment / Accounts Receivable

ต้องรองรับ Outstanding

ตัวอย่าง:

```text
Invoice:       100,000
Paid:           30,000
Outstanding:    70,000
```

## 16.1 Payment Status

```text
PENDING
PARTIALLY_PAID
PAID
OVERDUE
REFUNDED
```

## 16.2 Payment Data

```text
Payment ID
Invoice ID
Amount
Payment Date
Due Date
Payment Method
Bank
Transaction Reference
Receipt Number
Attachment
Recorded By
```

## 16.3 Payment Flow

```text
Policy
  ↓
Invoice
  ↓
Payment Pending
  ↓
Partial Payment
  ↓
Paid
```

---

# 17. Invoice / Receipt

ต้องรองรับ:

```text
Invoice
Receipt
Credit Note
Debit Note
```

Relationship:

```text
Policy
 ↓
Invoice
 ↓
Payment
 ↓
Receipt
```

---

# 18. Commission Module

## 18.1 Calculation

ตัวอย่าง:

```text
Net Premium × Commission Rate
```

ต้องรองรับ:

```text
Gross Commission
Agent Share
Broker Share
Override
Adjustment
Tax / WHT
Net Commission
```

## 18.2 Commission Status

```text
CALCULATED
APPROVED
PAYABLE
PAID
ADJUSTED
```

## 18.3 Commission Statement

ต้องสามารถสรุปตาม:

```text
Agent
Policy
Insurer
Period
Product
```

---

# 19. Endorsement Module

หลัง Policy Issued ห้ามแก้ Policy สำคัญโดยตรง

ต้องสร้าง Endorsement

Flow:

```text
ACTIVE POLICY
      ↓
ENDORSEMENT REQUEST
      ↓
REVIEW
      ↓
APPROVAL
      ↓
ENDORSEMENT ISSUED
      ↓
POLICY UPDATED
```

## 19.1 Endorsement Type

```text
CHANGE_CUSTOMER
CHANGE_ADDRESS
CHANGE_COVERAGE
CHANGE_SUM_INSURED
ADD_ASSET
REMOVE_ASSET
CHANGE_VEHICLE
CHANGE_EFFECTIVE_DATE
OTHER
```

## 19.2 Endorsement Status

```text
DRAFT
REQUESTED
REVIEWING
APPROVED
REJECTED
ISSUED
CANCELLED
```

ต้องเก็บ Premium Adjustment:

```text
ADDITIONAL_PREMIUM
REFUND_PREMIUM
NO_CHANGE
```

---

# 20. Cancellation / Refund

## 20.1 Job Cancellation

ก่อน Policy ออก:

```text
JOB_CANCELLED
```

ต้องระบุ:

```text
Reason
Requested By
Approved By
Cancelled At
```

## 20.2 Policy Cancellation

หลัง Policy ออก:

```text
ACTIVE
 ↓
CANCEL_REQUESTED
 ↓
CANCELLED
```

ต้องเก็บ:

```text
Cancellation Reason
Request Date
Effective Cancellation Date
Insurer Confirmation
Cancellation Document
Refund Amount
Outstanding Amount
```

## 20.3 Refund

```text
REFUND_REQUESTED
      ↓
REFUND_APPROVED
      ↓
REFUND_PROCESSED
```

---

# 21. Renewal Module

Renewal ไม่ควรเป็นเพียงการสร้าง Job ใหม่

ต้องมี Renewal Pipeline

## 21.1 Renewal Timeline

```text
90 Days Before
    ↓
Renewal Reminder

60 Days
    ↓
Contact Customer

45 Days
    ↓
Request Quotation

30 Days
    ↓
Send Proposal

15 Days
    ↓
Follow Up

7 Days
    ↓
Urgent Follow Up

Expiry
    ↓
Expired / Renewed
```

## 21.2 Renewal Status

```text
PENDING
CONTACTING_CUSTOMER
QUOTATION_REQUESTED
PROPOSAL_SENT
CUSTOMER_ACCEPTED
RENEWED
CUSTOMER_REJECTED
EXPIRED
```

Renewal Job ต้อง link กับ:

```text
Previous Policy
Previous Job
Customer
```

---

# 22. Claim Module

Claim เป็น Module แยกจาก Job

```text
Policy
  ↓
Claim
```

## 22.1 Claim Status

```text
REPORTED
SUBMITTED
ASSESSING
INFO_REQUIRED
APPROVED
REJECTED
SETTLED
CLOSED
```

## 22.2 Claim Data

```text
Claim Number
Policy
Customer
Incident Date
Reported Date
Incident Type
Description
Claim Amount
Approved Amount
Insurer
Adjuster
Documents
Settlement Date
```

---

# 23. Task / Follow-up

Task ต้องเป็น Entity กลาง

```text
Task ID
Task Type
Related Customer
Related Job
Related Policy
Assigned To
Priority
Due Date
Status
Description
Completed At
```

## 23.1 Task Status

```text
OPEN
IN_PROGRESS
COMPLETED
CANCELLED
OVERDUE
```

ตัวอย่าง Task:

```text
Follow up Customer
Request Document
Request Quotation
Follow up Insurer
Follow up Payment
Renewal Follow-up
Claim Follow-up
```

---

# 24. Notification

ระบบควรสร้าง Notification จาก Event

ตัวอย่าง:

```text
Quotation Received
Approval Requested
Approval Rejected
Customer Accepted
Customer Rejected
Payment Due
Payment Overdue
Policy Issued
Policy Expiring
Renewal Due
Claim Updated
Task Overdue
```

ช่องทาง:

```text
IN_APP
EMAIL
LINE
```

---

# 25. Audit Log

ทุก Transaction สำคัญต้องมี Audit Log

ข้อมูล:

```text
User
Action
Entity
Entity ID
Timestamp
Before
After
IP Address
Source
Remark
```

ตัวอย่าง:

```text
User: staff01
Action: UPDATE_QUOTATION
Entity: Quotation
Before Premium: 100,000
After Premium: 120,000
Timestamp: 2026-10-08 10:30
```

---

# 26. Role / Permission / Data Scope

Role หลัก:

```text
ADMIN
AGENT
BROKER_STAFF
MANAGER
FINANCE
```

แยกเป็น 3 ระดับ:

```text
Role
Permission
Data Scope
```

ตัวอย่าง:

### AGENT

```text
Customer: Own
Job: Own
Quotation: View
Proposal: Create / Send
```

### BROKER_STAFF

```text
Customer: Assigned / Branch
Job: Assigned
Quotation: Create / Update / Select
Binding: Create
```

### MANAGER

```text
Approval
Team Jobs
Reports
```

### FINANCE

```text
Invoice
Payment
Receipt
Commission
Refund
```

### ADMIN

```text
All
```

---

# 27. Master Data

ระบบควรมี Master Data:

```text
Insurer
Insurance Type
Product
Coverage
Exclusion
Deductible
Commission Rate
Tax
Stamp Duty
Document Checklist
Approval Rule
Underwriting Rule
Payment Term
Customer Type
Industry
Vehicle Type
Risk Type
Branch
Agent
Broker Staff
```

ความสัมพันธ์ที่ควรออกแบบ:

```text
Product
  ↓
Coverage
  ↓
Document Requirement
  ↓
Underwriting Rule
  ↓
Commission Rule
  ↓
Approval Rule
```

เป้าหมายคือเพิ่ม Product ใหม่โดยแก้ Configuration มากกว่าแก้ Code

---

# 28. Recommended Entity Relationship

```text
Customer
   │
   ├── Contact
   ├── Address
   │
   └── Job
        │
        ├── Risk
        ├── Coverage
        ├── Documents
        ├── Underwriting
        ├── Quotations
        │      └── Quotation Versions
        │
        ├── Proposal
        │      └── Acceptance
        │
        ├── Approval
        │
        ├── Binding
        │
        ├── Policy
        │      ├── Endorsement
        │      ├── Claim
        │      ├── Invoice
        │      │      └── Payment
        │      ├── Commission
        │      └── Renewal
        │
        ├── Tasks
        └── Audit Logs
```

---

# 29. V2 Priority

## P0 — ต้องทำ

```text
1. Underwriting
2. Quotation Version
3. Quotation Expiry
4. Customer Acceptance Evidence
5. Approval Reject / Resubmit
6. Binding Details
7. Payment Status / Outstanding
8. Invoice / Receipt
9. Cancellation
10. Audit Log
```

## P1 — ควรทำ

```text
11. Endorsement
12. Refund
13. Renewal Pipeline
14. Task / Follow-up
15. Notification
16. Commission Statement
17. Commission Adjustment
18. Document Version / Verification
19. Customer Contact / Address
20. Insurer Management
```

## P2 — Full Platform

```text
21. Claim Management
22. Customer Portal
23. Agent Portal
24. Insurer Integration
25. Payment Gateway
26. E-Signature
27. LINE OA
28. Email Automation
29. Dashboard / KPI
30. Accounting Integration
```

---

# 30. Recommended V2 End-to-End Flow

```text
CUSTOMER
   ↓
CREATE JOB
   ↓
RISK INFORMATION
   ↓
DOCUMENT CHECK
   ↓
UNDERWRITING
   ├── INFO_REQUIRED → Update Risk / Document → Re-review
   ├── REJECTED → Close Job
   └── APPROVED
          ↓
QUOTATION REQUEST
          ↓
QUOTATION RECEIVED
          ↓
QUOTATION COMPARISON
          ↓
SELECT QUOTATION
          ↓
PROPOSAL
          ↓
CUSTOMER
   ├── REJECT → CLOSED
   ├── EXPIRE → Follow-up / New Proposal
   └── ACCEPT
          ↓
APPROVAL
   ├── REJECT → Edit → Resubmit
   └── APPROVE
          ↓
BINDING
   ├── REJECT → Resolve
   └── CONFIRMED
          ↓
POLICY PENDING
          ↓
POLICY ISSUED
          ↓
INVOICE
          ↓
PAYMENT
   ├── PARTIAL
   ├── OVERDUE
   └── PAID
          ↓
COMMISSION
          ↓
ACTIVE POLICY
   ├── ENDORSEMENT
   ├── CLAIM
   ├── CANCELLATION / REFUND
   └── RENEWAL
          ↓
RENEWAL
   ↓
NEW RENEWAL JOB
```

---

# 31. Definition of Done — V2

V2 ถือว่าครบ Core Broker Workflow เมื่อสามารถทำได้อย่างน้อย:

- [ ] สร้าง Customer
- [ ] สร้าง Job
- [ ] Assign Agent / Staff
- [ ] กรอก Dynamic Risk
- [ ] ตรวจ Document Checklist
- [ ] Underwriting Review
- [ ] Request Quotation
- [ ] บันทึกหลาย Insurer
- [ ] รองรับ Quotation Version
- [ ] ตรวจ Quotation Expiry
- [ ] Compare Quotation
- [ ] Select Quotation
- [ ] Generate Proposal
- [ ] ส่ง Proposal
- [ ] Customer Accept / Reject
- [ ] เก็บ Acceptance Evidence
- [ ] Approval Rule
- [ ] Maker-Checker
- [ ] Approval Reject / Resubmit
- [ ] Binding
- [ ] Policy Issue
- [ ] Invoice
- [ ] Payment
- [ ] Partial Payment
- [ ] Overdue
- [ ] Receipt
- [ ] Commission Calculation
- [ ] Commission Statement
- [ ] Policy Endorsement
- [ ] Policy Cancellation
- [ ] Refund
- [ ] Renewal Pipeline
- [ ] Claim
- [ ] Task / Follow-up
- [ ] Notification
- [ ] Audit Log
- [ ] Role / Permission / Data Scope
- [ ] Master Data

---

# 32. V2 Implementation Rule

สิ่งสำคัญที่สุด:

```text
อย่าเริ่มจากการเพิ่ม Button
```

ให้เริ่มจาก:

```text
1. Domain / Entity
2. State Machine
3. Business Rule
4. Permission
5. API
6. Database
7. UI
8. Notification
9. Audit
10. Test Case
```

สำหรับทุก Module ให้กำหนด:

```text
Entity
Status
Allowed Transition
Action
Permission
Validation
Required Document
Business Rule
Audit Event
Notification Event
```

ตัวอย่าง:

```text
Quotation

Entity:
Quotation

Status:
REQUESTED
RECEIVED
ACTIVE
EXPIRED
SELECTED

Action:
request
record
update
select
expire
withdraw

Permission:
quotation.create
quotation.update
quotation.select

Validation:
valid_until > quotation_date
premium >= 0
insurer required

Audit:
QUOTATION_CREATED
QUOTATION_UPDATED
QUOTATION_SELECTED
QUOTATION_EXPIRED

Notification:
QUOTATION_RECEIVED
QUOTATION_EXPIRING
```

---

# 33. Final Architecture Principle

V2 ควรคิดระบบเป็น:

```text
CRM
 +
Broker Workflow
 +
Underwriting
 +
Policy Administration
 +
Billing / AR
 +
Commission
 +
Claim
 +
Renewal
 +
Task / Notification
 +
Audit / Compliance
```

ไม่ควรออกแบบเป็นเพียง:

```text
Customer
→ Job
→ Policy
```

เพราะเมื่อระบบโตขึ้น จะรองรับ Endorsement, Claim, Cancellation, Refund และ Renewal ได้ยาก

เป้าหมายของ V2 คือ:

```text
                    ┌──────────────┐
                    │   CUSTOMER   │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │     JOB      │
                    └──────┬───────┘
                           ↓
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
      RISK             QUOTATION         DOCUMENT
        ↓                  ↓                  ↓
 UNDERWRITING         PROPOSAL             VERIFY
        │                  ↓
        └──────────→ CUSTOMER ←──────────────┘
                         ↓
                      APPROVAL
                         ↓
                      BINDING
                         ↓
                       POLICY
              ┌──────────┼──────────┐
              ↓          ↓          ↓
           PAYMENT   ENDORSEMENT   CLAIM
              ↓          ↓          ↓
         COMMISSION   POLICY       SETTLEMENT
                         ↓
                      RENEWAL
```

---

# 34. Development Recommendation

แนะนำให้พัฒนา V2 ตามลำดับ:

```text
Phase 1
Customer
Job
Risk
Document
Underwriting

Phase 2
Quotation
Quotation Version
Proposal
Customer Acceptance

Phase 3
Approval
Binding
Policy

Phase 4
Invoice
Payment
Receipt
Commission

Phase 5
Endorsement
Cancellation
Refund

Phase 6
Renewal
Task
Notification

Phase 7
Claim
Dashboard
Portal
Integration
```

อย่าเริ่ม Claim / Dashboard / Portal ก่อน Core Policy Lifecycle ทำงานสมบูรณ์

