-- BR-005: 1 Job มี Selected Quotation ได้ 1 รายการ (DESIGN §5.3)
CREATE UNIQUE INDEX quotations_one_selected_per_job
  ON quotations (job_id) WHERE status = 'SELECTED';

-- เงินต้องไม่ติดลบ
ALTER TABLE quotations ADD CONSTRAINT quotations_total_non_negative CHECK (total_amount >= 0);
