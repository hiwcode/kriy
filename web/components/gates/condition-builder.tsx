"use client";

import * as React from "react";
import { Plus, Trash2, FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  type ConditionNode,
  type GroupCondition,
  type LeafCondition,
  type LeafOp,
  type MatchKind,
  isGroup,
} from "@/lib/api/gates";

const OPS: { value: LeafOp; label: string }[] = [
  { value: "eq", label: "equals" },
  { value: "ne", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "≤" },
  { value: "in", label: "in list" },
  { value: "not_in", label: "not in list" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "matches", label: "matches regex" },
  { value: "exists", label: "exists" },
  { value: "not_exists", label: "does not exist" },
];

const NO_VALUE_OPS = new Set<LeafOp>(["exists", "not_exists"]);
const LIST_OPS = new Set<LeafOp>(["in", "not_in"]);

const MATCH_LABELS: Record<MatchKind, string> = {
  all: "ALL of (AND)",
  any: "ANY of (OR)",
  none: "NONE of (NOR)",
};

// --------------------------------------------------------------------------- //
// value <-> text helpers
// --------------------------------------------------------------------------- //

function parseScalar(text: string): unknown {
  const t = text.trim();
  if (t === "") return "";
  try {
    return JSON.parse(t); // "500" -> 500, "true" -> true, '"x"' -> "x"
  } catch {
    return text; // bare string
  }
}

function valueToText(value: unknown, op: LeafOp): string {
  if (LIST_OPS.has(op)) {
    if (Array.isArray(value)) {
      return value
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
        .join(", ");
    }
    return "";
  }
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function textToValue(text: string, op: LeafOp): unknown {
  if (LIST_OPS.has(op)) {
    return text
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => parseScalar(s));
  }
  if (op === "matches") return text; // regex stays a raw string
  return parseScalar(text);
}

// --------------------------------------------------------------------------- //
// Leaf
// --------------------------------------------------------------------------- //

function LeafEditor({
  node,
  onChange,
  onRemove,
}: {
  node: LeafCondition;
  onChange: (n: LeafCondition) => void;
  onRemove: () => void;
}) {
  const showValue = !NO_VALUE_OPS.has(node.op);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={node.field}
        placeholder="payload.user.role"
        onChange={(e) => onChange({ ...node, field: e.target.value })}
        className="h-8 w-52 font-mono text-xs"
      />
      <NativeSelect
        size="sm"
        value={node.op}
        onChange={(e) => {
          const op = e.target.value as LeafOp;
          // Drop the value when moving to a no-value op; re-coerce for list ops.
          const next: LeafCondition = { ...node, op };
          if (NO_VALUE_OPS.has(op)) delete next.value;
          else next.value = textToValue(valueToText(node.value, node.op), op);
          onChange(next);
        }}
        className="w-40"
      >
        {OPS.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {showValue && (
        <Input
          value={valueToText(node.value, node.op)}
          placeholder={LIST_OPS.has(node.op) ? "a, b, c" : "value"}
          onChange={(e) => onChange({ ...node, value: textToValue(e.target.value, node.op) })}
          className="h-8 w-44 font-mono text-xs"
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label="Remove condition"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Group (recursive)
// --------------------------------------------------------------------------- //

function newLeaf(): LeafCondition {
  return { field: "", op: "eq", value: "" };
}
function newGroup(): GroupCondition {
  return { match: "all", conditions: [] };
}

function GroupEditor({
  node,
  onChange,
  onRemove,
  depth,
}: {
  node: GroupCondition;
  onChange: (n: GroupCondition) => void;
  onRemove?: () => void;
  depth: number;
}) {
  const setChild = (i: number, child: ConditionNode) => {
    const conditions = node.conditions.slice();
    conditions[i] = child;
    onChange({ ...node, conditions });
  };
  const removeChild = (i: number) => {
    onChange({ ...node, conditions: node.conditions.filter((_, j) => j !== i) });
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border",
        depth > 0 && "bg-muted/30",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Match</span>
        <NativeSelect
          size="sm"
          value={node.match}
          onChange={(e) => onChange({ ...node, match: e.target.value as MatchKind })}
          className="w-40"
        >
          {(Object.keys(MATCH_LABELS) as MatchKind[]).map((k) => (
            <NativeSelectOption key={k} value={k}>
              {MATCH_LABELS[k]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span className="text-xs text-muted-foreground">the following</span>
        <div className="ml-auto" />
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Remove group"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      <div className="space-y-2 p-3">
        {node.conditions.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            No conditions yet — a group with no conditions never matches.
          </p>
        )}
        {node.conditions.map((child, i) =>
          isGroup(child) ? (
            <div key={i} className="border-l-2 border-primary/30 pl-3">
              <GroupEditor
                node={child}
                depth={depth + 1}
                onChange={(c) => setChild(i, c)}
                onRemove={() => removeChild(i)}
              />
            </div>
          ) : (
            <LeafEditor
              key={i}
              node={child}
              onChange={(c) => setChild(i, c)}
              onRemove={() => removeChild(i)}
            />
          ),
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange({ ...node, conditions: [...node.conditions, newLeaf()] })}
          >
            <Plus className="size-3.5" /> Condition
          </Button>
          {depth < 4 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onChange({ ...node, conditions: [...node.conditions, newGroup()] })}
            >
              <FolderPlus className="size-3.5" /> Group
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConditionBuilder({
  value,
  onChange,
}: {
  value: GroupCondition;
  onChange: (v: GroupCondition) => void;
}) {
  return <GroupEditor node={value} depth={0} onChange={onChange} />;
}
