import type { Task } from '../../../generated/prisma/client.js';

export type TaskResponse = Task & { overdue: boolean };

export interface TaskListResponse {
  items: TaskResponse[];
  total: number;
}
