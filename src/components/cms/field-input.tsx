"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, Trash2, ChevronUp, ChevronDown, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/cms/rich-text-editor";
import { MediaPicker } from "@/components/cms/media-picker";
import type { FieldDefinition } from "@/server/cms/types";

type Value = unknown;
type OnChange = (value: Value) => void;

/** Cloudinary serves video from /video/upload/; also match bare extensions. */
function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url) || url.includes("/video/upload/");
}

/**
 * Image or image-plus-video field.
 *
 * `accept="media"` widens the picker to video for the one renderer that handles
 * it (the hero slide). The preview branches on the URL because next/image
 * throws on a video source — which is why this couldn't simply be the existing
 * ImageField with a looser filter.
 */
function ImageField({
  value,
  onChange,
  accept = "image",
}: {
  value: Value;
  onChange: OnChange;
  accept?: "image" | "media";
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const url = typeof value === "string" ? value : "";
  const isVideo = url !== "" && isVideoUrl(url);
  const noun = accept === "media" ? "media" : "image";

  return (
    <div className="flex items-center gap-3">
      {url ? (
        <div className="relative h-20 w-20 overflow-hidden rounded-md border">
          {isVideo ? (
            <video
              src={url}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full bg-black object-cover"
            />
          ) : (
            <Image src={url} alt="" fill className="object-cover" sizes="80px" />
          )}
        </div>
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          {url ? `Change ${noun}` : `Choose ${noun}`}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Remove
          </Button>
        )}
      </div>
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(asset) => onChange(asset.url)}
        accept={accept}
      />
    </div>
  );
}

function ArrayField({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: Value;
  onChange: OnChange;
}) {
  const items: Array<Record<string, unknown>> = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : [];
  const subFields = field.of ?? [];

  function updateItem(index: number, itemValue: Record<string, unknown>) {
    const next = [...items];
    next[index] = itemValue;
    onChange(next);
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {field.label} #{i + 1}
            </span>
            <div className="flex gap-1">
              <Button
                type="button" variant="ghost" size="icon" className="h-6 w-6"
                disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button" variant="ghost" size="icon" className="h-6 w-6"
                disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button" variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {subFields.filter((sub) => isFieldVisible(sub, item)).map((sub) => (
              <FieldInput
                key={sub.name}
                field={sub}
                value={item[sub.name]}
                onChange={(v) => updateItem(i, { ...item, [sub.name]: v })}
              />
            ))}
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, {}])}
      >
        <Plus className="h-4 w-4" /> Add {field.label.toLowerCase()}
      </Button>
    </div>
  );
}

/**
 * The generic renderer behind the whole CMS: one widget per field type, with
 * array/object types recursing into their `of` sub-fields — no per-content-
 * type hardcoded forms anywhere.
 */
export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: Value;
  onChange: OnChange;
}) {
  if (field.hidden) return null;

  const str = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);

  const control = (() => {
    switch (field.type) {
      case "textarea":
        return (
          <Textarea
            value={str}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
        );
      case "richtext":
        return (
          <RichTextEditor
            value={str}
            onChange={onChange}
            placeholder={field.placeholder}
            maxLength={field.validation?.max}
          />
        );
      case "number":
        return (
          <Input
            type="number"
            value={str}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            min={field.validation?.min}
            max={field.validation?.max}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
        );
      case "boolean":
        return (
          <Switch checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
        );
      case "select":
        return (
          <Select value={str} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder ?? "Choose…"} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "image":
        return <ImageField value={value} onChange={onChange} />;
      case "media":
        return <ImageField value={value} onChange={onChange} accept="media" />;
      case "date":
        return (
          <Input
            type="date"
            value={str.slice(0, 10)}
            readOnly={field.readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "color":
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(str) ? str : "#000000"}
              onChange={(e) => onChange(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-md border"
            />
            <Input value={str} placeholder="#000000" onChange={(e) => onChange(e.target.value)} className="w-28" />
          </div>
        );
      case "array":
        return <ArrayField field={field} value={value} onChange={onChange} />;
      case "object":
        return (
          <div className="space-y-3 rounded-md border p-3">
            {(field.of ?? []).map((sub) => (
              <FieldInput
                key={sub.name}
                field={sub}
                value={((value as Record<string, unknown>) ?? {})[sub.name]}
                onChange={(v) =>
                  onChange({ ...((value as Record<string, unknown>) ?? {}), [sub.name]: v })
                }
              />
            ))}
          </div>
        );
      case "slug":
      case "text":
      default:
        return (
          <Input
            value={str}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  })();

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1">
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
      </Label>
      {control}
    </div>
  );
}

/**
 * Whether a field applies to the item currently being edited.
 *
 * Only meaningful inside arrays/objects, where sibling values are available —
 * a top-level field has no siblings and is always shown.
 */
export function isFieldVisible(
  field: FieldDefinition,
  siblings: Record<string, unknown>
): boolean {
  if (!field.showWhen) return true;
  const actual = siblings[field.showWhen.field];
  return typeof actual === "string" && field.showWhen.equals.includes(actual);
}
