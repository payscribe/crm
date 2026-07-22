import type { CrmRecordType } from "@/lib/types/activity";

const pathBuilders: Record<CrmRecordType, (id: string) => string> = {
  Business: (id) => `/businesses/${id}`,
  Lead: (id) => `/leads/${id}`,
  Partner: (id) => `/partners/${id}`,
  Ticket: (id) => `/tickets/${id}`,
  "Product Event": (id) => `/product-log/${id}`
};

export function entityDetailPath(entityType: CrmRecordType, entityId: string) {
  return pathBuilders[entityType](entityId);
}
