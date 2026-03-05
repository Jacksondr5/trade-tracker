"use client";

import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef } from "react";

interface StrategyEditorProps {
  initialContent: string;
  onUpdate: (markdown: string) => void;
}

export function StrategyEditor({
  initialContent,
  onUpdate,
}: StrategyEditorProps) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-9 underline hover:text-blue-10 cursor-pointer",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full rounded-lg",
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing your trading strategy...",
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Markdown,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "prose-strategy outline-none min-h-[60vh] px-6 py-4",
      },
    },
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const markdown = (editor.storage as any).markdown.getMarkdown() as string;
      onUpdateRef.current(markdown);
    },
  });

  // Track initialization to avoid re-setting content
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (editor && !hasInitialized.current) {
      hasInitialized.current = true;
    }
  }, [editor]);

  return (
    <div className="rounded-lg border border-olive-7 bg-olive-2 focus-within:ring-2 focus-within:ring-blue-8 focus-within:ring-offset-2 focus-within:ring-offset-olive-1">
      <EditorContent editor={editor} />
    </div>
  );
}
