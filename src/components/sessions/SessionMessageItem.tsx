import { memo, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Terminal, FileEdit, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SessionMessage } from "@/types";
import {
  formatTimestamp,
  getRoleLabel,
  getRoleTone,
  highlightText,
} from "./utils";

const COLLAPSE_THRESHOLD = 3000;
const COLLAPSED_LENGTH = 1500;

interface SessionMessageItemProps {
  message: SessionMessage;
  isActive: boolean;
  searchQuery?: string;
  onCopy: (content: string) => void;
}

interface ToolCall {
  type: "bash" | "edit" | "read" | "write" | "think" | "other";
  name: string;
  command?: string;
  output: string;
}

/**
 * Parse tool call content into structured blocks.
 * Supports formats like:
 *   [Tool: Bash] ls -la\n\ntotal 23...
 *   [Tool: Edit] file.ts\n--- a/file.ts\n+++ b/file.ts
 *   [Tool: Read] src/index.ts\n\nfile content...
 */
function parseToolCalls(content: string): ToolCall[] {
  const toolBlocks: ToolCall[] = [];
  // Match [Tool: Name] optional-command\n\noutput
  const toolRegex = /^\[Tool:\s*(\w+)\]\s*(.*?)(?:\n\n|\n)([\s\S]*?)$/gm;
  let match: RegExpExecArray | null;
  while ((match = toolRegex.exec(content)) !== null) {
    const rawName = match[1].toLowerCase();
    const command = match[2].trim() || undefined;
    const output = match[3].trim();
    let type: ToolCall["type"] = "other";
    if (rawName === "bash") type = "bash";
    else if (rawName === "edit") type = "edit";
    else if (rawName === "read") type = "read";
    else if (rawName === "write") type = "write";
    else if (rawName === "think") type = "think";
    toolBlocks.push({ type, name: match[1], command, output });
  }
  // If no structured tool calls found, return empty
  return toolBlocks;
}

const toolIconMap: Record<ToolCall["type"], typeof Terminal> = {
  bash: Terminal,
  edit: FileEdit,
  read: BookOpen,
  write: FileEdit,
  think: BookOpen,
  other: Terminal,
};

const toolColorMap: Record<ToolCall["type"], string> = {
  bash: "text-green-500 border-green-200 dark:border-green-800",
  edit: "text-amber-500 border-amber-200 dark:border-amber-800",
  read: "text-blue-500 border-blue-200 dark:border-blue-800",
  write: "text-purple-500 border-purple-200 dark:border-purple-800",
  think: "text-sky-500 border-sky-200 dark:border-sky-800",
  other: "text-muted-foreground border-border",
};

function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [showOutput, setShowOutput] = useState(false);
  const Icon = toolIconMap[tool.type];
  const isLong = tool.output.length > 500;

  return (
    <div
      className={cn(
        "rounded border px-2.5 py-2 my-1.5 text-xs",
        toolColorMap[tool.type],
      )}
    >
      <div className="flex items-center gap-1.5 font-mono font-semibold">
        <Icon className="size-3.5 shrink-0" />
        <span>{tool.name}</span>
        {tool.command && (
          <span className="font-normal text-muted-foreground truncate ml-1">
            {tool.command}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowOutput((v) => !v)}
          className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
        >
          {showOutput ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
        </button>
      </div>
      {showOutput && (
        <pre className="mt-1.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted-foreground max-h-96 overflow-y-auto">
          {isLong ? tool.output.slice(0, 2000) + (tool.output.length > 2000 ? "\n… (truncated)" : "") : tool.output}
        </pre>
      )}
    </div>
  );
}

export const SessionMessageItem = memo(function SessionMessageItem({
  message,
  isActive,
  searchQuery,
  onCopy,
}: SessionMessageItemProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // Parse tool calls if this is a tool message
  const toolCalls = useMemo(
    () => (message.role.toLowerCase() === "tool" ? parseToolCalls(message.content) : []),
    [message.content, message.role],
  );

  const isLong = message.content.length > COLLAPSE_THRESHOLD;
  const hasSearchMatch =
    isLong &&
    !expanded &&
    !!searchQuery &&
    message.content.toLowerCase().includes(searchQuery.toLowerCase());
  const collapsed = isLong && !expanded && !hasSearchMatch;
  const displayContent = collapsed
    ? message.content.slice(0, COLLAPSED_LENGTH) + "…"
    : message.content;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 relative group transition-shadow min-w-0",
        message.role.toLowerCase() === "user"
          ? "bg-primary/5 border-primary/20 ml-8"
          : message.role.toLowerCase() === "assistant"
            ? "bg-blue-500/5 border-blue-500/20 mr-8"
            : "bg-muted/40 border-border/60",
        isActive && "ring-2 ring-primary ring-offset-2",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 size-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onCopy(message.content)}
          >
            <Copy className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {t("sessionManager.copyMessage", {
            defaultValue: "复制内容",
          })}
        </TooltipContent>
      </Tooltip>
      <div className="flex items-center justify-between text-xs mb-1.5 pr-6">
        <span className={cn("font-semibold", getRoleTone(message.role))}>
          {getRoleLabel(message.role, t)}
        </span>
        {message.ts && (
          <span className="text-muted-foreground">
            {formatTimestamp(message.ts)}
          </span>
        )}
      </div>
      {toolCalls.length > 0 ? (
        <div className="space-y-1">
          {toolCalls.map((tool, i) => (
            <ToolCallCard key={i} tool={tool} />
          ))}
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed min-w-0">
          {searchQuery
            ? highlightText(displayContent, searchQuery)
            : displayContent}
        </div>
      )}
      {isLong && !hasSearchMatch && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              {t("sessionManager.collapseContent", {
                defaultValue: "收起",
              })}
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              {t("sessionManager.expandContent", {
                defaultValue: "展开完整内容",
              })}
              <span className="text-muted-foreground/60">
                ({Math.round(message.content.length / 1000)}k)
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
});
