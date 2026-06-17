export type EmployeeStatus =
  | "active"
  | "probation"
  | "on_leave"
  | "suspended"
  | "terminated"
  | "resigned"
  | "retired";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "intern"
  | "consultant";

export type Gender = "male" | "female" | "other";

export interface HrDepartment {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  head_employee_id: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HrDesignation {
  id: string;
  title: string;
  department_id: string | null;
  level: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HrEmployee {
  id: string;
  employee_code: string;
  user_id: string | null;
  full_name: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  alt_phone: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  marital_status: string | null;
  blood_group: string | null;
  nationality: string | null;
  nid: string | null;
  passport: string | null;
  tin: string | null;
  photo_url: string | null;
  status: EmployeeStatus;
  employment_type: EmploymentType | null;
  joining_date: string;
  confirmation_date: string | null;
  probation_months: number | null;
  exit_date: string | null;
  exit_reason: string | null;
  department_id: string | null;
  designation_id: string | null;
  manager_id: string | null;
  brand_ids: string[];
  work_location: string | null;
  work_email: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_no: string | null;
  bank_routing: string | null;
  mfs_provider: string | null;
  mfs_number: string | null;
  gross_salary: number | null;
  currency: string;
  present_address: string | null;
  permanent_address: string | null;
  emergency_name: string | null;
  emergency_relation: string | null;
  emergency_phone: string | null;
  tags: string[];
  notes: string | null;
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface HrKpis {
  headcount: number;
  active: number;
  probation: number;
  onLeave: number;
  newThisMonth: number;
  exitsThisMonth: number;
  totalMonthlyPayroll: number;
  byDepartment: { name: string; count: number }[];
  byStatus: { status: string; count: number }[];
  upcomingBirthdays: { id: string; name: string; date: string; in: number }[];
  upcomingAnniversaries: { id: string; name: string; years: number; date: string; in: number }[];
}

export interface HrEmployeeFilters {
  search?: string;
  status?: EmployeeStatus | "all";
  departmentId?: string | "all";
  designationId?: string | "all";
  employmentType?: EmploymentType | "all";
  brandIds?: string[];
  managerId?: string | "all";
  tag?: string | "all";
}

export interface HrSettings {
  id: string;
  brand_id: string | null;
  default_currency: string;
  weekly_off_days: number[];
  work_hours_per_day: number;
  probation_months: number;
  employee_code_prefix: string;
  employee_code_padding: number;
  next_employee_seq: number;
  fiscal_year_start_month: number;
}

/* ===== Phase 2: Attendance + Leave ===== */

export type AttendanceStatus =
  | "present"
  | "absent"
  | "late"
  | "half_day"
  | "leave"
  | "holiday"
  | "week_off";

export type AttendanceSource = "manual" | "web" | "mobile" | "biometric" | "import";

export interface HrShift {
  id: string;
  brand_id: string | null;
  name: string;
  code: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_minutes: number;
  half_day_after_min: number;
  is_night: boolean;
  is_default: boolean;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrEmployeeShift {
  id: string;
  employee_id: string;
  shift_id: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrHoliday {
  id: string;
  brand_id: string | null;
  date: string;
  name: string;
  type: string;
  is_optional: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrAttendanceRow {
  id: string;
  employee_id: string;
  date: string;
  in_time: string | null;
  out_time: string | null;
  shift_id: string | null;
  status: AttendanceStatus;
  source: AttendanceSource;
  late_min: number;
  early_leave_min: number;
  ot_min: number;
  work_min: number;
  note: string | null;
  marked_by: string | null;
  ip_address: string | null;
  location: any;
  created_at: string;
  updated_at: string;
}

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface HrLeaveType {
  id: string;
  brand_id: string | null;
  name: string;
  code: string;
  color: string;
  is_paid: boolean;
  default_days_per_year: number;
  max_carry_forward: number;
  requires_approval: boolean;
  min_notice_days: number;
  applies_to_gender: string | null;
  is_active: boolean;
  description: string | null;
}

export interface HrLeaveBalance {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  allocated: number;
  used: number;
  carried: number;
  encashed: number;
}

export interface HrLeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  days: number;
  is_half_day: boolean;
  half_day_part: string | null;
  reason: string | null;
  status: LeaveRequestStatus;
  approver_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  attachment_url: string | null;
  contact_during_leave: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceKpis {
  totalEmployees: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  avgWorkHours: number;
  totalOtHours: number;
}

export interface LeaveKpis {
  pending: number;
  approvedThisMonth: number;
  rejectedThisMonth: number;
  onLeaveToday: number;
  upcoming: { id: string; employee_name: string; from_date: string; to_date: string; days: number; type: string; color: string }[];
}