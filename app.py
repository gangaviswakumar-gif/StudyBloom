
from flask import Flask, render_template, request, jsonify
from database import get_connection

from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo

app = Flask(__name__)

# Use the computer's local timezone for daily records.
# Change this if you want to use another timezone.
LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")

DEFAULT_GOAL = 7200


def today():
    return datetime.now(LOCAL_TIMEZONE).date()


def get_goal(conn, target_date):
    result = conn.execute(
        """
        SELECT goal_seconds
        FROM daily_goals
        WHERE goal_date = %s
        """,
        (target_date,)
    ).fetchone()

    return result["goal_seconds"] if result else DEFAULT_GOAL


def get_focus_seconds(conn, target_date):
    result = conn.execute(
        """
        SELECT COALESCE(SUM(duration_seconds), 0) AS total
        FROM focus_sessions
        WHERE focus_date = %s
        """,
        (target_date,)
    ).fetchone()

    return result["total"]


def calculate_streak(conn):
    current_date = today()

    # Read the recent daily focus totals.
    rows = conn.execute(
        """
        SELECT focus_date, SUM(duration_seconds) AS total
        FROM focus_sessions
        WHERE focus_date >= %s
          AND focus_date <= %s
        GROUP BY focus_date
        """,
        (current_date - timedelta(days=365), current_date)
    ).fetchall()

    focus_by_date = {
        row["focus_date"]: row["total"]
        for row in rows
    }

    # A day counts only when its focus goal is reached.
    # If today's goal has not been reached yet, the
    # streak can continue from yesterday until today ends.
    check_date = current_date

    if focus_by_date.get(current_date, 0) < get_goal(
        conn, current_date
    ):
        check_date -= timedelta(days=1)

    streak = 0

    while True:
        total = focus_by_date.get(check_date, 0)
        goal = get_goal(conn, check_date)

        if total < goal:
            break

        streak += 1
        check_date -= timedelta(days=1)

    return streak


@app.route("/")
def home():
    return render_template("index.html")


# ---------------- DASHBOARD ----------------

@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    current_date = today()

    with get_connection() as conn:
        tasks = conn.execute(
            """
            SELECT id, title, completed
            FROM tasks
            WHERE task_date = %s
            ORDER BY id DESC
            """,
            (current_date,)
        ).fetchall()

        note_result = conn.execute(
            """
            SELECT note
            FROM daily_notes
            WHERE note_date = %s
            """,
            (current_date,)
        ).fetchone()

        focus_seconds = get_focus_seconds(
            conn, current_date
        )

        goal_seconds = get_goal(
            conn, current_date
        )

        streak = calculate_streak(conn)

    return jsonify({
        "tasks": tasks,
        "note": note_result["note"] if note_result else "",
        "focus_seconds": focus_seconds,
        "goal_seconds": goal_seconds,
        "streak": streak
    })


# ---------------- TASKS ----------------

@app.route("/api/tasks", methods=["POST"])
def add_task():
    data = request.get_json(silent=True) or {}
    title = data.get("title", "").strip()

    if not title:
        return jsonify({"error": "Task title is required"}), 400

    if len(title) > 255:
        return jsonify({"error": "Task title is too long"}), 400

    with get_connection() as conn:
        task = conn.execute(
            """
            INSERT INTO tasks (title, task_date)
            VALUES (%s, %s)
            RETURNING id, title, completed
            """,
            (title, today())
        ).fetchone()

    return jsonify(task), 201


@app.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def update_task(task_id):
    data = request.get_json(silent=True) or {}

    if not isinstance(data.get("completed"), bool):
        return jsonify({"error": "A valid completed value is required"}), 400

    with get_connection() as conn:
        task = conn.execute(
            """
            UPDATE tasks
            SET completed = %s
            WHERE id = %s AND task_date = %s
            RETURNING id
            """,
            (data["completed"], task_id, today())
        ).fetchone()

    if not task:
        return jsonify({"error": "Task not found"}), 404

    return jsonify({"success": True})


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    with get_connection() as conn:
        task = conn.execute(
            """
            DELETE FROM tasks
            WHERE id = %s AND task_date = %s
            RETURNING id
            """,
            (task_id, today())
        ).fetchone()

    if not task:
        return jsonify({"error": "Task not found"}), 404

    return jsonify({"success": True})


# ---------------- DAILY NOTE ----------------

@app.route("/api/note", methods=["PUT"])
def save_note():
    data = request.get_json(silent=True) or {}
    note = data.get("note", "")

    if not isinstance(note, str):
        return jsonify({"error": "Note must be text"}), 400

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO daily_notes (note_date, note)
            VALUES (%s, %s)
            ON CONFLICT (note_date)
            DO UPDATE SET note = EXCLUDED.note
            """,
            (today(), note)
        )

    return jsonify({"success": True})


# ---------------- DAILY GOAL ----------------

@app.route("/api/goal", methods=["PUT"])
def save_goal():
    data = request.get_json(silent=True) or {}

    try:
        hours = float(data.get("hours"))
    except (TypeError, ValueError):
        return jsonify({"error": "Enter a valid goal"}), 400

    if not 0.1 <= hours <= 24:
        return jsonify({
            "error": "Goal must be between 0.1 and 24 hours"
        }), 400

    goal_seconds = round(hours * 3600)

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO daily_goals (goal_date, goal_seconds)
            VALUES (%s, %s)
            ON CONFLICT (goal_date)
            DO UPDATE SET goal_seconds = EXCLUDED.goal_seconds
            """,
            (today(), goal_seconds)
        )

    return jsonify({"success": True})


# ---------------- FOCUS SESSION ----------------

@app.route("/api/focus", methods=["POST"])
def save_focus():
    data = request.get_json(silent=True) or {}

    try:
        duration = int(data.get("duration_seconds"))
        started_at = datetime.fromisoformat(
            data.get("started_at", "").replace("Z", "+00:00")
        )

        if started_at.tzinfo is None:
            started_at = started_at.replace(
                tzinfo=LOCAL_TIMEZONE
            )

        started_at = started_at.astimezone(timezone.utc)
        ended_at = datetime.now(timezone.utc)

    except (TypeError, ValueError, AttributeError):
        return jsonify({"error": "Invalid focus session data"}), 400

    if duration <= 0:
        return jsonify({"error": "Focus duration must be positive"}), 400

    if started_at > ended_at:
        return jsonify({"error": "Start time cannot be in the future"}), 400

    # Store the date in the user's local timezone.
    focus_date = started_at.astimezone(
        LOCAL_TIMEZONE
    ).date()

    with get_connection() as conn:
        session = conn.execute(
            """
            INSERT INTO focus_sessions
            (started_at, ended_at, duration_seconds, focus_date)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (started_at, ended_at, duration, focus_date)
        ).fetchone()

    return jsonify({
        "success": True,
        "session_id": session["id"]
    }), 201


# ---------------- ERROR HANDLING ----------------

@app.errorhandler(500)
def internal_error(error):
    app.logger.exception("Internal server error: %s", error)
    return jsonify({"error": "An internal server error occurred"}), 500


if __name__ == "__main__":
    app.run(debug=True)
