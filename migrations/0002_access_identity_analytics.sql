ALTER TABLE reader_events ADD COLUMN access_email TEXT;
ALTER TABLE reader_events ADD COLUMN access_email_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_reader_events_access_email_book
  ON reader_events (access_email, book_id, created_at);
