export type StaffStatus = "Active" | "Inactive";

export type StaffUser = {
  user_id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  slack_user_id: string | null;
  status: StaffStatus;
  is_super_admin: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};
