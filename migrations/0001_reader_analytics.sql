CREATE TABLE IF NOT EXISTS reader_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'progress', 'finish')),
  book_id TEXT NOT NULL,
  reader_id_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  progress_percent INTEGER,
  chapter_id TEXT,
  source_type TEXT,
  user_agent_hash TEXT,
  country TEXT,
  referer_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_reader_events_book_time
  ON reader_events (book_id, created_at);

CREATE INDEX IF NOT EXISTS idx_reader_events_reader_time
  ON reader_events (reader_id_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_reader_events_type_time
  ON reader_events (event_type, created_at);
