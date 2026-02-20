#!/usr/bin/env python3
"""
AgentSense Backfill Preprocessor

Reads session logs and memory files, extracts clean text,
chunks into ~6KB blocks, and inserts into the observations table
as pending observations for extraction.

Usage:
  python3 backfill-prepare.py [--dry-run] [--memory-only] [--sessions-only]
                              [--recent-days N] [--chunk-size N]
"""

import json
import os
import glob
import sqlite3
import argparse
import re
from pathlib import Path
from datetime import datetime, timedelta

DB_PATH = os.path.expanduser("~/.openclaw/memory/agentsense.db")
SESSIONS_DIR = os.path.expanduser("~/.openclaw/agents/main/sessions/")
MEMORY_DIR = os.path.expanduser("~/.openclaw/workspace/memory/")
CHUNK_SIZE = 6000  # chars per observation (~1500 tokens)
MIN_MSG_LEN = 80   # skip short messages


def extract_text_from_content(content):
    """Extract plain text from message content (string or list)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    texts.append(item.get("text", ""))
        return "\n".join(texts)
    return ""


def is_noise(text: str) -> bool:
    """Filter out noise."""
    if len(text) < MIN_MSG_LEN:
        return True
    if text.strip().startswith("{") and '"toolCallId"' in text:
        return True
    if "<knowledge-graph-context>" in text[:100]:
        return True
    stripped = text.strip()
    if stripped in ("NO_REPLY", "HEARTBEAT_OK"):
        return True
    return False


def clean_text(text: str) -> str:
    """Clean text for entity extraction."""
    # Remove knowledge-graph-context blocks
    text = re.sub(r'<knowledge-graph-context>.*?</knowledge-graph-context>', '', text, flags=re.DOTALL)
    # Remove conversation metadata JSON blocks
    text = re.sub(r'```json\n\{[^}]*"message_id"[^}]*\}\n```', '', text, flags=re.DOTALL)
    # Remove tool result blocks
    text = re.sub(r'<function_results>.*?</function_results>', '[tool output]', text, flags=re.DOTALL)
    # Collapse multiple newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def chunk_text(text: str, source: str, chunk_size: int = CHUNK_SIZE) -> list:
    """Split text into chunks with source attribution."""
    if len(text) <= chunk_size:
        return [(text, source)]

    chunks = []
    paragraphs = text.split("\n\n")
    current = ""

    for para in paragraphs:
        if len(current) + len(para) + 2 > chunk_size and current:
            chunks.append((current.strip(), source))
            current = para
        else:
            current = current + "\n\n" + para if current else para

    if current.strip():
        chunks.append((current.strip(), source))

    return chunks


def process_memory_files() -> list:
    """Process all memory markdown files."""
    chunks = []
    patterns = [
        os.path.join(MEMORY_DIR, "*.md"),
        os.path.join(MEMORY_DIR, "kb", "*.md"),
        os.path.join(MEMORY_DIR, "archive", "*.md"),
        os.path.join(MEMORY_DIR, "archive", "**", "*.md"),
    ]

    seen_files = set()
    for pattern in patterns:
        for filepath in glob.glob(pattern, recursive=True):
            if filepath in seen_files:
                continue
            seen_files.add(filepath)

            try:
                with open(filepath, "r") as f:
                    text = f.read()
                if len(text.strip()) < MIN_MSG_LEN:
                    continue
                rel_path = os.path.relpath(filepath, MEMORY_DIR)
                source = f"memory:{rel_path}"
                text = clean_text(text)
                chunks.extend(chunk_text(text, source))
            except Exception as e:
                print(f"  ⚠ Error reading {filepath}: {e}")

    return chunks


def process_session_file(filepath: str) -> list:
    """Extract clean text from a single session JSONL file."""
    messages = []
    basename = os.path.basename(filepath)

    try:
        with open(filepath, "r") as f:
            for line in f:
                try:
                    obj = json.loads(line)
                    msg = obj.get("message", obj)
                    role = msg.get("role", "")

                    if role not in ("user", "assistant"):
                        continue

                    content = msg.get("content", "")
                    text = extract_text_from_content(content)

                    if is_noise(text):
                        continue

                    text = clean_text(text)
                    if len(text) >= MIN_MSG_LEN:
                        prefix = "User" if role == "user" else "Assistant"
                        messages.append(f"[{prefix}]: {text}")
                except (json.JSONDecodeError, KeyError):
                    continue
    except Exception as e:
        print(f"  ⚠ Error reading {filepath}: {e}")
        return []

    if not messages:
        return []

    # Join messages and chunk
    full_text = "\n\n".join(messages)
    source = f"session:{basename}"
    return chunk_text(full_text, source)


def process_sessions(recent_days: int = None) -> list:
    """Process session log files."""
    files = sorted(
        glob.glob(os.path.join(SESSIONS_DIR, "*.jsonl")),
        key=os.path.getmtime,
        reverse=True,
    )

    if recent_days:
        cutoff = datetime.now() - timedelta(days=recent_days)
        files = [f for f in files if datetime.fromtimestamp(os.path.getmtime(f)) >= cutoff]

    chunks = []
    for filepath in files:
        file_chunks = process_session_file(filepath)
        chunks.extend(file_chunks)
        if file_chunks:
            print(f"  📄 {os.path.basename(filepath)}: {len(file_chunks)} chunks")

    return chunks


def insert_observations(chunks: list, dry_run: bool = False):
    """Insert chunks into the observations table."""
    if dry_run:
        print(f"\n🔍 DRY RUN — would insert {len(chunks)} observations")
        for i, (text, source) in enumerate(chunks[:5]):
            print(f"  [{i+1}] source={source} len={len(text)}")
            print(f"      {text[:100]}...")
        if len(chunks) > 5:
            print(f"  ... and {len(chunks) - 5} more")
        return

    db = sqlite3.connect(DB_PATH)
    inserted = 0
    for text, source in chunks:
        try:
            db.execute(
                "INSERT INTO observations (source, raw_text, entities_json, session_key) VALUES (?, ?, '', ?)",
                (f"backfill:{source}", text, f"backfill-{datetime.now().strftime('%Y%m%d')}"),
            )
            inserted += 1
        except Exception as e:
            print(f"  ⚠ Insert error: {e}")

    db.commit()
    db.close()
    print(f"\n✅ Inserted {inserted} observations into agentsense.db")


def main():
    parser = argparse.ArgumentParser(description="AgentSense Backfill Preprocessor")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting")
    parser.add_argument("--memory-only", action="store_true", help="Only process memory files")
    parser.add_argument("--sessions-only", action="store_true", help="Only process session logs")
    parser.add_argument("--recent-days", type=int, help="Only process sessions from last N days")
    parser.add_argument("--chunk-size", type=int, default=CHUNK_SIZE, help="Chunk size in chars")
    args = parser.parse_args()

    print("🧠 AgentSense Backfill Preprocessor")
    print(f"   DB: {DB_PATH}")
    print(f"   Chunk size: {args.chunk_size} chars")
    print()

    all_chunks = []

    if not args.sessions_only:
        print("📁 Processing memory files...")
        memory_chunks = process_memory_files()
        print(f"   → {len(memory_chunks)} chunks from memory files")
        all_chunks.extend(memory_chunks)

    if not args.memory_only:
        print(f"\n📁 Processing session logs{f' (last {args.recent_days} days)' if args.recent_days else ''}...")
        session_chunks = process_sessions(args.recent_days)
        print(f"   → {len(session_chunks)} chunks from session logs")
        all_chunks.extend(session_chunks)

    total_chars = sum(len(t) for t, _ in all_chunks)
    print(f"\n📊 Total: {len(all_chunks)} chunks, {total_chars:,} chars (~{total_chars // 4:,} tokens)")

    # Check current pending count
    if os.path.exists(DB_PATH):
        db = sqlite3.connect(DB_PATH)
        pending = db.execute("SELECT COUNT(*) FROM observations WHERE entities_json = ''").fetchone()[0]
        total_obs = db.execute("SELECT COUNT(*) FROM observations").fetchone()[0]
        db.close()
        print(f"   Current DB: {total_obs} observations ({pending} pending)")

    insert_observations(all_chunks, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
