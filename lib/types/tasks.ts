import type { CrmRecordType } from "@/lib/types/activity";

export type TaskStatus = "Open" | "Done" | "Cancelled";

export type Task = {
  task_id: string;
  title: string;
  notes: string | null;
  entity_type: CrmRecordType | null;
  entity_id: string | null;
  assigned_to: string;
  due_date: string;
  status: TaskStatus;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
