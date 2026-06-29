import { memo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Terminal, FileText, Hammer, Code, Globe, Braces } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SessionMessage, MessagePart } from "@/types";
import {
  formatTimestamp,
  getRoleLabel,
  getRoleTone,
} from "./utils";

const COLLAPSE_THRESHOLD = 3000;
const COLLAPSED_LENGTH = 1500;

interface SessionMessageItemProps {
  message: SessionMessage;
  isActive: boolean;
  searchQuery?: string;
  onCopy: (content: string) => void;
}

function getToolIcon(name: string) {
  const n = name.toLowerCase();
  if (n === "bash" || n === "powershell" || n === "cmd" || n === "shell" || n === "terminal") return Terminal;
  if (n === "write" || n === "edit" || n === "create") return FileText;
  if (n === "read" || n === "glob" || n === "grep") return FileText;
  if (n === "websearch" || n === "web_fetch" || n === "fetch" || n === "web") return Globe;
  if (n === "code" || n === "javascript" || n === "exec") return Code;
  if (n === "mcp" || n === "skill") return Braces;
  return Hammer;
}

/** Renders a single tool_use part as an inline card. */
const ToolUseCard = memo(function ToolUseCard({ part, collapsed, onToggle }: {
  part: MessagePart & { type: "toolUse" };
  collapsed: boolean;
  onToggle: () => void;
}) {
  const Icon = getToolIcon(part.name);
  return (
    <div className="my-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm font-mono text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="font-semibold">Tool: {part.name}</span>
        <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </span>
      </button>
      {!collapsed && part.input && (
        <pre className="px-3 py-2 text-xs overflow-x-auto text-amber-900 dark:text-amber-100 whitespace-pre-wrap font-mono border-t border-amber-200 dark:border-amber-800">
          {part.input}
        </pre>
      )}
    </div>
  );
});

/** Renders a single tool_result part as an inline card. */
const ToolResultCard = memo(function ToolResultCard({ content, collapsed, onToggle }: {
  content: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="my-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm font-mono text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
      >
        <Terminal className="h-4 w-4 shrink-0" />
        <span className="font-semibold">Tool Result</span>
        <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-auto">
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </span>
      </button>
      {!collapsed && content && (
        <pre className="px-3 py-2 text-xs overflow-x-auto text-emerald-900 dark:text-emerald-100 whitespace-pre-wrap font-mono border-t border-emerald-200 dark:border-emerald-800 max-h-96 overflow-y-auto">
          {content}
        </pre>
      )}
    </div>
  );
});

/** Renders a part based on its type. */
function PartRenderer({ part, depth = 0 }: { part: MessagePart; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 0);

  switch (part.type) {
    case "text":
      return <span>{part.text}</span>;
    case "toolUse":
      return (
        <ToolUseCard
          part={part}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      );
    case "toolResult":
      return (
        <ToolResultCard
          content={part.content}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      );
    default:
      return null;
  }
}

export const SessionMessageItem = memo(function SessionMessageItem({
  message,
  isActive,
  searchQuery,
  onCopy,
}: SessionMessageItemProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const hasParts = message.parts && message.parts.length > 0;

  // For messages with parts, use the legacy content as fallback
  // This maintains backward compatibility while allowing rich rendering
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

  const roleLower = message.role.toLowerCase();

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 relative group transition-shadow min-w-0",
        roleLower === "user"
          ? "bg-primary/5 border-primary/20 ml-8"
          : roleLower === "assistant"
          ? "bg-blue-500/5 border-blue-500/20 mr-8"
          : "bg-muted/40 border-border/60",
        isActive && "ring-2 ring-primary/30",
      )}
    >
      {/* Header: role badge + timestamp + copy */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider",
            getRoleTone(message.role),
          )}
        >
          {getRoleLabel(message.role)}
        </span>
        {message.ts != null && (
          <span className="text-[0.6rem] text-muted-foreground/60">
            {formatTimestamp(message.ts)}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 h-5 w-5 ml-auto transition-opacity"
              onClick={() => onCopy(message.content)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {t("common.copy")}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Body: rich parts rendering (preferred) / legacy text fallback */}
      {hasParts ? (
        <div className="text-sm leading-relaxed space-y-1">
          {message.parts!.map((part, i) => (
            <PartRenderer key={i} part={part} depth={i} />
          ))}
        </div>
      ) : (
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {searchQuery ? (
            <HighlightedText
              text={displayContent}
              query={searchQuery}
              collapsed={collapsed}
              onToggle={() => setExpanded(!expanded)}
            />
          ) : (
            displayContent
          )}
        </div>
      )}

      {/* Expand/collapse for long messages */}
      {isLong && !hasParts && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              <span>{t("sessionManager.collapse")}</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              <span>{t("sessionManager.expandFullContent")}</span>
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

/** Simple highlight component for search matches. */
function HighlightedText({
  text,
  query,
  collapsed,
  onToggle,
}: {
  text: string;
  query: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
      {collapsed && (
        <button
          onClick={onToggle}
          className="ml-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="h-3 w-3 inline" />
        </button>
      )}
    </>
  );
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
