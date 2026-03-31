export interface TicketRow {
  id: string;
  project: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  tags: string;
  pipeline: string | null;
  estimated_hours: number | null;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  name: string;
  key: string;
  path: string;
  created_at: string;
}

export const VALID_TRANSITIONS: Record<string, string[]> = {
  backlog: ["running", "aborted"],
  running: ["paused", "done"],
  paused: ["running", "aborted"],
  // done, aborted = terminal states
};

