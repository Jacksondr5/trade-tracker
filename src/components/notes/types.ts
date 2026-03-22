export interface Note {
  _id: string;
  _creationTime: number;
  chartUrls?: string[];
  content: string;
  contextHref?: string | null;
  contextKind?: "campaign" | "general" | "tradePlan";
  contextLabel?: string;
}

export interface NotesSectionProps {
  defaultShowEvidence?: boolean;
  notes: Note[];
  onAddNote: (content: string, chartUrls?: string[]) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onUpdateNote: (
    noteId: string,
    content: string,
    chartUrls?: string[],
  ) => Promise<void>;
  showContext?: boolean;
  testIdPrefix?: string;
}
