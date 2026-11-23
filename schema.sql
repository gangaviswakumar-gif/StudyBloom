
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    task_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_notes (
    note_date DATE PRIMARY KEY,
    note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS daily_goals (
    goal_date DATE PRIMARY KEY,
    goal_seconds INTEGER NOT NULL DEFAULT 7200
        CHECK (goal_seconds > 0)
);

CREATE TABLE IF NOT EXISTS focus_sessions (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL
        CHECK (duration_seconds > 0),
    focus_date DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_date
ON tasks(task_date);

CREATE INDEX IF NOT EXISTS idx_focus_date
ON focus_sessions(focus_date);
