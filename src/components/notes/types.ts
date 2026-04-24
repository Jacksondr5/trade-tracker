export interface Note {
  _id: string;
  _creationTime: number;
  chartUrls?: string[];
  content: string;
  contextHref?: string | null;
  contextKind?: "campaign" | "general" | "tradePlan";
  contextLabel?: string;
  noteDate: number;
}

export interface NotesSectionProps {
  defaultShowEvidence?: boolean;
  notes: Note[];
  onAddNote: (
    content: string,
    noteDate: number,
    chartUrls?: string[],
  ) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onUpdateNote: (
    noteId: string,
    content: string,
    noteDate: number,
    chartUrls?: string[],
  ) => Promise<void>;
  showContext?: boolean;
  testIdPrefix?: string;
}
