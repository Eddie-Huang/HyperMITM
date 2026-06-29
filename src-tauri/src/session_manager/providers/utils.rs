use std::fs::File;
use std::io::{self, BufRead, BufReader, Seek, SeekFrom};
use std::path::Path;

use chrono::{DateTime, FixedOffset};
use serde_json::Value;

/// Maximum number of characters for session titles (shared across providers).
pub const TITLE_MAX_CHARS: usize = 80;

/// Maximum characters for tool input content in session messages.
pub const TOOL_INPUT_MAX_CHARS: usize = 2000;

/// Read the first `head_n` lines and last `tail_n` lines from a file.
/// For small files (< 16 KB), reads all lines once to avoid unnecessary seeking.
pub fn read_head_tail_lines(
    path: &Path,
    head_n: usize,
    tail_n: usize,
) -> io::Result<(Vec<String>, Vec<String>)> {
    let file = File::open(path)?;
    let file_len = file.metadata()?.len();

    // For small files, read all lines once and split
    if file_len < 16_384 {
        let reader = BufReader::new(file);
        let all: Vec<String> = reader.lines().map_while(Result::ok).collect();
        let head = all.iter().take(head_n).cloned().collect();
        let skip = all.len().saturating_sub(tail_n);
        let tail = all.into_iter().skip(skip).collect();
        return Ok((head, tail));
    }

    // Read head lines from the beginning
    let reader = BufReader::new(file);
    let head: Vec<String> = reader.lines().take(head_n).map_while(Result::ok).collect();

    // Seek to last ~16 KB for tail lines
    let seek_pos = file_len.saturating_sub(16_384);
    let mut file2 = File::open(path)?;
    file2.seek(SeekFrom::Start(seek_pos))?;
    let tail_reader = BufReader::new(file2);
    let all_tail: Vec<String> = tail_reader.lines().map_while(Result::ok).collect();

    // Skip first partial line if we seeked into the middle of a line
    let skip_first = if seek_pos > 0 { 1 } else { 0 };
    let usable: Vec<String> = all_tail.into_iter().skip(skip_first).collect();
    let skip = usable.len().saturating_sub(tail_n);
    let tail = usable.into_iter().skip(skip).collect();

    Ok((head, tail))
}

pub fn parse_timestamp_to_ms(value: &Value) -> Option<i64> {
    // Integer: milliseconds (>1e12) or seconds
    if let Some(n) = value.as_i64() {
        return Some(if n > 1_000_000_000_000 { n } else { n * 1000 });
    }
    if let Some(n) = value.as_f64() {
        let n = n as i64;
        return Some(if n > 1_000_000_000_000 { n } else { n * 1000 });
    }
    // RFC3339 string
    let raw = value.as_str()?;
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|dt: DateTime<FixedOffset>| dt.timestamp_millis())
}

pub fn extract_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.to_string(),
        Value::Array(items) => items
            .iter()
            .filter_map(extract_text_from_item)
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(map) => map
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        _ => String::new(),
    }
}

fn extract_text_from_item(item: &Value) -> Option<String> {
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");

    // tool_use: show tool name + input arguments
    if item_type == "tool_use" {
        let name = item
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let input_text = item
            .get("input")
            .map(|v| format_tool_input(v))
            .unwrap_or_default();
        if input_text.is_empty() {
            return Some(format!("[Tool: {name}]"));
        }
        let truncated = truncate_text(&input_text, TOOL_INPUT_MAX_CHARS);
        return Some(format!("[Tool: {name}]\n{truncated}"));
    }

    // tool_result: extract nested content
    if item_type == "tool_result" {
        if let Some(content) = item.get("content") {
            let text = extract_text(content);
            if !text.is_empty() {
                return Some(text);
            }
        }
        return None;
    }

    if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
        return Some(text.to_string());
    }

    if let Some(text) = item.get("input_text").and_then(|v| v.as_str()) {
        return Some(text.to_string());
    }

    if let Some(text) = item.get("output_text").and_then(|v| v.as_str()) {
        return Some(text.to_string());
    }

    if let Some(content) = item.get("content") {
        let text = extract_text(content);
        if !text.is_empty() {
            return Some(text);
        }
    }

    None
}

/// Format a tool's input field into readable text.
/// For object inputs, extract priority keys like "command", "file_path", etc.
/// For string inputs, return directly. For other types, JSON-serialize.
fn format_tool_input(input: &Value) -> String {
    match input {
        Value::String(s) => s.clone(),
        Value::Object(map) => {
            let priority_keys = [
                "command",
                "file_path",
                "pattern",
                "query",
                "content",
                "description",
                "text",
            ];
            let mut parts: Vec<String> = Vec::new();
            for key in &priority_keys {
                if let Some(val) = map.get(*key) {
                    let text = match val.as_str() {
                        Some(s) => s,
                        None => &serde_json::to_string(val).unwrap_or_default(),
                    };
                    parts.push(format!("{key}: {text}"));
                }
            }
            for (key, val) in map {
                if !priority_keys.contains(&key.as_str()) {
                    let text = match val.as_str() {
                        Some(s) => s,
                        None => &serde_json::to_string(val).unwrap_or_default(),
                    };
                    parts.push(format!("{key}: {text}"));
                }
            }
            parts.join("\n")
        }
        _ => serde_json::to_string(input).unwrap_or_default(),
    }
}

/// Truncate text to a maximum length, adding an ellipsis suffix if truncated.
fn truncate_text(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        text.to_string()
    } else {
        let truncated = text[..text.floor_char_boundary(max_len)].to_string();
        format!("{truncated}\n... (truncated)")
    }
}

pub fn truncate_summary(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }

    let mut result = trimmed.chars().take(max_chars).collect::<String>();
    result.push_str("...");
    result
}

pub fn path_basename(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let normalized = trimmed.trim_end_matches(['/', '\\']);
    let last = normalized
        .split(['/', '\\'])
        .next_back()
        .filter(|segment| !segment.is_empty())?;
    Some(last.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_timestamp_to_ms_supports_integers_and_rfc3339() {
        assert_eq!(
            parse_timestamp_to_ms(&json!(1_771_061_953_033_i64)),
            Some(1_771_061_953_033)
        );
        assert_eq!(
            parse_timestamp_to_ms(&json!(1_771_061_953_i64)),
            Some(1_771_061_953_000)
        );
        assert_eq!(
            parse_timestamp_to_ms(&json!("1970-01-01T00:00:01Z")),
            Some(1_000)
        );
    }

    #[test]
    fn extract_text_from_item_tool_use_with_input() {
        let item = json!({
            "type": "tool_use",
            "name": "Bash",
            "input": {"command": "ls -la"}
        });
        let result = extract_text_from_item(&item);
        assert_eq!(result, Some("[Tool: Bash]\ncommand: ls -la".to_string()));
    }

    #[test]
    fn extract_text_from_item_tool_use_without_input() {
        let item = json!({
            "type": "tool_use",
            "name": "Bash"
        });
        let result = extract_text_from_item(&item);
        assert_eq!(result, Some("[Tool: Bash]".to_string()));
    }

    #[test]
    fn extract_text_from_item_tool_use_string_input() {
        let item = json!({
            "type": "tool_use",
            "name": "Read",
            "input": "/path/to/file.ts"
        });
        let result = extract_text_from_item(&item);
        assert_eq!(result, Some("[Tool: Read]\n/path/to/file.ts".to_string()));
    }

    #[test]
    fn extract_text_from_item_tool_use_multi_field_input() {
        let item = json!({
            "type": "tool_use",
            "name": "Write",
            "input": {"file_path": "/src/app.ts", "content": "hello"}
        });
        let result = extract_text_from_item(&item);
        let expected = "[Tool: Write]\nfile_path: /src/app.ts\ncontent: hello";
        assert_eq!(result, Some(expected.to_string()));
    }

    #[test]
    fn format_tool_input_object_priority_ordering() {
        let input = json!({
            "description": "search for pattern",
            "pattern": "fn main",
            "command": "grep -r 'fn main'"
        });
        let result = format_tool_input(&input);
        // command should come before pattern and description due to priority ordering
        assert!(result.starts_with("command: grep -r 'fn main'"));
        assert!(result.contains("pattern: fn main"));
        assert!(result.contains("description: search for pattern"));
    }

    #[test]
    fn truncate_text_short_passthrough() {
        let result = truncate_text("hello", 10);
        assert_eq!(result, "hello".to_string());
    }

    #[test]
    fn truncate_text_long_truncates() {
        let long = "a".repeat(3000);
        let result = truncate_text(&long, 2000);
        assert!(result.ends_with("... (truncated)"));
        assert!(result.len() < 3000);
    }
}
