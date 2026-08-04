"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Strikethrough,
  UnderlineIcon,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link2,
  Link2Off,
  ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/components/cms/media-picker";

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // StarterKit v3 bundles link/underline — configured separately below.
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      TiptapImage,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      CharacterCount.configure({ limit: maxLength }),
      Placeholder.configure({ placeholder: placeholder ?? "Write something…" }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return <div className="min-h-32 rounded-md border bg-muted/30" />;

  function setLink() {
    const previous = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().unsetLink().run();
      return;
    }
    editor!.chain().focus().setLink({ href: url }).run();
  }

  const btn = (
    label: string,
    icon: React.ReactNode,
    action: () => void,
    isActive = false
  ) => (
    <Button
      key={label}
      type="button"
      variant={isActive ? "secondary" : "ghost"}
      size="icon"
      className="h-8 w-8"
      onClick={action}
      aria-label={label}
      title={label}
    >
      {icon}
    </Button>
  );

  const chain = () => editor.chain().focus();

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap gap-0.5 border-b p-1">
        {btn("Bold", <Bold className="h-4 w-4" />, () => chain().toggleBold().run(), editor.isActive("bold"))}
        {btn("Italic", <Italic className="h-4 w-4" />, () => chain().toggleItalic().run(), editor.isActive("italic"))}
        {btn("Underline", <UnderlineIcon className="h-4 w-4" />, () => chain().toggleUnderline().run(), editor.isActive("underline"))}
        {btn("Strikethrough", <Strikethrough className="h-4 w-4" />, () => chain().toggleStrike().run(), editor.isActive("strike"))}
        {btn("Code", <Code className="h-4 w-4" />, () => chain().toggleCode().run(), editor.isActive("code"))}
        <span className="mx-1 w-px bg-border" />
        {btn("Heading 1", <Heading1 className="h-4 w-4" />, () => chain().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
        {btn("Heading 2", <Heading2 className="h-4 w-4" />, () => chain().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
        {btn("Heading 3", <Heading3 className="h-4 w-4" />, () => chain().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
        <span className="mx-1 w-px bg-border" />
        {btn("Bullet list", <List className="h-4 w-4" />, () => chain().toggleBulletList().run(), editor.isActive("bulletList"))}
        {btn("Numbered list", <ListOrdered className="h-4 w-4" />, () => chain().toggleOrderedList().run(), editor.isActive("orderedList"))}
        {btn("Blockquote", <Quote className="h-4 w-4" />, () => chain().toggleBlockquote().run(), editor.isActive("blockquote"))}
        {btn("Divider", <Minus className="h-4 w-4" />, () => chain().setHorizontalRule().run())}
        <span className="mx-1 w-px bg-border" />
        {btn("Align left", <AlignLeft className="h-4 w-4" />, () => chain().setTextAlign("left").run(), editor.isActive({ textAlign: "left" }))}
        {btn("Align center", <AlignCenter className="h-4 w-4" />, () => chain().setTextAlign("center").run(), editor.isActive({ textAlign: "center" }))}
        {btn("Align right", <AlignRight className="h-4 w-4" />, () => chain().setTextAlign("right").run(), editor.isActive({ textAlign: "right" }))}
        <span className="mx-1 w-px bg-border" />
        {btn("Link", <Link2 className="h-4 w-4" />, setLink, editor.isActive("link"))}
        {btn("Remove link", <Link2Off className="h-4 w-4" />, () => chain().unsetLink().run())}
        {btn("Image from library", <ImageIcon className="h-4 w-4" />, () => setPickerOpen(true))}
        <span className="mx-1 w-px bg-border" />
        {btn("Undo", <Undo className="h-4 w-4" />, () => chain().undo().run())}
        {btn("Redo", <Redo className="h-4 w-4" />, () => chain().redo().run())}
      </div>

      <EditorContent
        editor={editor}
        className="prose prose-sm min-h-32 max-w-none px-3 py-2 [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
      />

      {maxLength && (
        <p className="border-t px-3 py-1 text-right text-xs text-muted-foreground">
          {editor.storage.characterCount.characters()}/{maxLength}
        </p>
      )}

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(asset) =>
          editor
            .chain()
            .focus()
            .setImage({ src: asset.url, alt: asset.alt ?? asset.originalName })
            .run()
        }
      />
    </div>
  );
}
