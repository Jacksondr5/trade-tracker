"use client";

import { Extension, InputRule } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";

// Input rules for markdown-style links and images
const MarkdownShortcuts = Extension.create({
  name: "markdownShortcuts",

  addInputRules() {
    return [
      // ![alt](url) -> image node (must be before link rule)
      new InputRule({
        find: /!\[([^\]]*)\]\(([^)]+)\)$/,
        handler: ({ state, range, match }) => {
          const [, alt, src] = match;
          if (!src) return;
          const { tr, schema } = state;
          const imageNode = schema.nodes.image.create({
            src,
            alt: alt || "",
          });
          tr.replaceWith(range.from, range.to, imageNode);
        },
      }),
      // [text](url) -> linked text (negative lookbehind avoids matching images)
      new InputRule({
        find: /(?<!!)\[([^\]]+)\]\(([^)]+)\)$/,
        handler: ({ state, range, match }) => {
          const [, text, url] = match;
          if (!text || !url) return;
          const { tr, schema } = state;
          const linkMark = schema.marks.link.create({ href: url });
          tr.replaceWith(
            range.from,
            range.to,
            schema.text(text, [linkMark]),
          );
        },
      }),
    ];
  },
});

interface StrategyEditorProps {
  initialContent: string;
  onUpdate: (markdown: string) => void;
}

export function StrategyEditor({
  initialContent,
  onUpdate,
}: StrategyEditorProps) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

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
      MarkdownShortcuts,
    ],
    editorProps: {
      attributes: {
        class: "prose-strategy outline-none min-h-[60vh] px-6 py-4",
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      onUpdateRef.current(markdown);
    },
  });

  // Parse and set initial markdown content after editor is ready.
  // We can't use the `content` option because Tiptap parses it as HTML.
  // Instead, use tiptap-markdown's parser to convert markdown -> ProseMirror doc.
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (editor && !hasInitialized.current) {
      hasInitialized.current = true;
      if (initialContent) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parser = (editor.storage as any).markdown?.parser;
        if (parser) {
          const doc = parser.parse(initialContent);
          editor.commands.setContent(doc, { emitUpdate: false });
        }
      }
    }
  }, [editor, initialContent]);

  return (
    <div className="rounded-lg border border-olive-7 bg-olive-2 focus-within:ring-2 focus-within:ring-blue-8 focus-within:ring-offset-2 focus-within:ring-offset-olive-1">
      <EditorContent editor={editor} />
    </div>
  );
}
