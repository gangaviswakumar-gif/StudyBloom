
// ==========================================
// STUDYBLOOM - MAIN JAVASCRIPT
// ==========================================

// Get HTML elements by ID
const $ = (id) => document.getElementById(id);


// ==========================================
// TIMER STATE
// ==========================================

const state = {
    mode: "countdown",
    running: false,
    paused: false,

    remaining: 0,
    accumulated: 0,

    lastTick: null,
    sessionStartedAt: null,

    interval: null
};


// ==========================================
// HELPER FUNCTIONS
// ==========================================

function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds));

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    if (minutes > 0) {
        return `${minutes} min`;
    }

    return `${secs} sec`;
}


function formatClock(seconds) {
    seconds = Math.max(0, Math.floor(seconds));

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}


function showError(error) {
    console.error("StudyBloom Error:", error);
    alert(error.message || "Something went wrong.");
}


function notify(message) {
    if (
        "Notification" in window &&
        Notification.permission === "granted"
    ) {
        new Notification("StudyBloom 🌸", {
            body: message
        });
    }
}


// ==========================================
// API CONNECTION
// ==========================================

async function api(url, options = {}) {

    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    const contentType =
        response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
        throw new Error(
            "Unexpected server response. Check the Flask terminal."
        );
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Something went wrong."
        );
    }

    return data;
}


// ==========================================
// CLOCK
// ==========================================

function updateClock() {

    const now = new Date();

    if ($("todayDate")) {
        $("todayDate").textContent =
            now.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
            });
    }

    if ($("digitalTime")) {
        $("digitalTime").textContent =
            now.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit"
            });
    }

    const seconds = now.getSeconds();
    const minutes = now.getMinutes();
    const hours = now.getHours() % 12;

    if ($("secondHand")) {
        $("secondHand").style.transform =
            `translateX(-50%) rotate(${seconds * 6}deg)`;
    }

    if ($("minuteHand")) {
        $("minuteHand").style.transform =
            `translateX(-50%) rotate(${minutes * 6 + seconds * 0.1}deg)`;
    }

    if ($("hourHand")) {
        $("hourHand").style.transform =
            `translateX(-50%) rotate(${hours * 30 + minutes * 0.5}deg)`;
    }
}

updateClock();
setInterval(updateClock, 1000);


// ==========================================
// TASK MANAGEMENT
// ==========================================

function renderTasks(tasks) {

    const taskList = $("taskList");

    taskList.innerHTML = "";

    $("emptyTasks").hidden = tasks.length > 0;

    $("taskCount").textContent =
        tasks.filter(task => !task.completed).length;

    tasks.forEach(task => {

        const li = document.createElement("li");

        li.className =
            `task-item ${task.completed ? "done" : ""}`;


        // Checkbox

        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.checked = task.completed;

        checkbox.setAttribute(
            "aria-label",
            "Mark task complete"
        );

        checkbox.addEventListener("change", async () => {

            try {

                await api(`/api/tasks/${task.id}`, {
                    method: "PATCH",

                    body: JSON.stringify({
                        completed: checkbox.checked
                    })
                });

                await loadDashboard();

            } catch (error) {
                showError(error);
            }

        });


        // Task title

        const span = document.createElement("span");

        span.textContent = task.title;


        // Delete button

        const deleteButton =
            document.createElement("button");

        deleteButton.className = "delete-task";
        deleteButton.textContent = "×";

        deleteButton.setAttribute(
            "aria-label",
            "Delete task"
        );

        deleteButton.addEventListener("click", async () => {

            try {

                await api(`/api/tasks/${task.id}`, {
                    method: "DELETE"
                });

                await loadDashboard();

            } catch (error) {
                showError(error);
            }

        });


        li.append(
            checkbox,
            span,
            deleteButton
        );

        taskList.appendChild(li);

    });

}


// Add task

if ($("taskForm")) {

    $("taskForm").addEventListener("submit", async (event) => {

        event.preventDefault();

        const input = $("taskInput");

        const title = input.value.trim();

        if (!title) {
            return;
        }

        try {

            await api("/api/tasks", {
                method: "POST",

                body: JSON.stringify({
                    title: title
                })
            });

            input.value = "";

            await loadDashboard();

        } catch (error) {
            showError(error);
        }

    });

}


// ==========================================
// FOCUS PROGRESS AND STREAK
// ==========================================

function renderFocus(seconds, goal, streak) {

    $("focusTime").textContent =
        formatDuration(seconds);

    $("goalLabel").textContent =
        formatDuration(goal);

    $("streakCount").textContent = streak;

    $("streakMessage").textContent =
        streak > 0
            ? "Look at you, showing up for yourself!"
            : "Your next one starts today.";

    const percentage = goal > 0
        ? Math.min(100, (seconds / goal) * 100)
        : 0;

    $("progressFill").style.width =
        `${percentage}%`;
}


// ==========================================
// LOAD DASHBOARD
// IMPORTANT: Keep this function at top level.
// ==========================================

async function loadDashboard() {

    try {

        const data = await api("/api/dashboard");

        renderTasks(data.tasks);

        renderFocus(
            data.focus_seconds,
            data.goal_seconds,
            data.streak
        );

        $("dailyNote").value = data.note || "";

        $("goalHours").value =
            data.goal_seconds / 3600;

    } catch (error) {

        showError(error);

    }

}


// ==========================================
// DAILY NOTE
// ==========================================

let noteSaveTimeout;

if ($("dailyNote")) {

    $("dailyNote").addEventListener("input", () => {

        clearTimeout(noteSaveTimeout);

        noteSaveTimeout = setTimeout(async () => {

            try {

                await api("/api/note", {
                    method: "PUT",

                    body: JSON.stringify({
                        note: $("dailyNote").value
                    })
                });

            } catch (error) {
                showError(error);
            }

        }, 500);

    });

}


// ==========================================
// DAILY GOAL
// ==========================================

if ($("goalButton")) {

    $("goalButton").addEventListener("click", () => {
        $("goalDialog").showModal();
    });

}


if ($("saveGoal")) {

    $("saveGoal").addEventListener("click", async () => {

        try {

            const hours = Number($("goalHours").value);

            if (!Number.isFinite(hours) || hours < 0.1 || hours > 24) {
                throw new Error(
                    "Enter a goal between 0.1 and 24 hours."
                );
            }

            await api("/api/goal", {
                method: "PUT",

                body: JSON.stringify({
                    hours: hours
                })
            });

            $("goalDialog").close();

            await loadDashboard();

        } catch (error) {
            showError(error);
        }

    });

}


// ==========================================
// TIMER SETUP
// ==========================================

if ($("timerButton")) {

    $("timerButton").addEventListener("click", () => {
        $("timerDialog").showModal();
    });

}


// Countdown / Stopwatch selection

document.querySelectorAll(".mode").forEach(button => {

    button.addEventListener("click", () => {

        document.querySelectorAll(".mode").forEach(b => {
            b.classList.remove("active");
        });

        button.classList.add("active");

        state.mode = button.dataset.mode;

        $("minutesLabel").hidden =
            state.mode === "stopwatch";

    });

});


// Start timer

if ($("startTimer")) {

    $("startTimer").addEventListener("click", async () => {

        if (state.running || state.paused) {
            return;
        }

        if (
            "Notification" in window &&
            Notification.permission === "default"
        ) {
            await Notification.requestPermission();
        }

        if (state.mode === "countdown") {

            const minutes =
                Number($("timerMinutes").value);

            if (!Number.isFinite(minutes) || minutes <= 0) {
                showError(
                    new Error("Enter a valid timer duration.")
                );
                return;
            }

            state.remaining =
                Math.max(1, minutes) * 60;

        } else {

            state.remaining = 0;

        }

        state.accumulated = 0;

        state.sessionStartedAt =
            new Date().toISOString();

        state.running = true;
        state.paused = false;

        state.lastTick = Date.now();

        $("timerDialog").close();

        $("activeDialog").showModal();

        $("sessionStatus").textContent =
            "You're doing lovely. Keep going.";

        $("pauseTimer").textContent = "Pause";

        renderSession();

        startTicker();

    });

}


// ==========================================
// TIMER CALCULATIONS
// ==========================================

function currentSessionSeconds() {

    const currentRunningSeconds = state.running
        ? Math.floor((Date.now() - state.lastTick) / 1000)
        : 0;

    return state.accumulated + currentRunningSeconds;

}


function renderSession() {

    let value;

    if (state.mode === "countdown") {

        value = Math.max(
            0,
            state.remaining - currentSessionSeconds()
        );

    } else {

        value = currentSessionSeconds();

    }

    $("sessionDisplay").textContent =
        formatClock(value);

}


// ==========================================
// TIMER INTERVAL
// ==========================================

function startTicker() {

    clearInterval(state.interval);

    state.interval = setInterval(() => {

        renderSession();

        if (
            state.mode === "countdown" &&
            state.remaining - currentSessionSeconds() <= 0
        ) {

            state.accumulated =
                currentSessionSeconds();

            state.running = false;
            state.paused = true;

            clearInterval(state.interval);

            renderSession();

            $("sessionStatus").textContent =
                "Time is up! Your session is paused. Save it or resume.";

            $("pauseTimer").textContent = "Resume";

            notify(
                "Your focus timer is complete. Take a little break!"
            );

            const sound = $("alarmSound");

            if (sound) {
                sound.currentTime = 0;
                sound.play().catch(() => {});
            }

        }

    }, 250);

}


// ==========================================
// PAUSE AND RESUME
// ==========================================

if ($("pauseTimer")) {

    $("pauseTimer").addEventListener("click", () => {

        if (state.running) {

            state.accumulated =
                currentSessionSeconds();

            state.running = false;
            state.paused = true;

            clearInterval(state.interval);

            $("pauseTimer").textContent = "Resume";

            $("sessionStatus").textContent =
                "Paused. Take your time.";

        } else if (state.paused) {

            state.running = true;
            state.paused = false;

            state.lastTick = Date.now();

            $("pauseTimer").textContent = "Pause";

            $("sessionStatus").textContent =
                "Welcome back. Keep going.";

            startTicker();

        }

        renderSession();

    });

}


// ==========================================
// STOP AND SAVE FOCUS SESSION
// ==========================================

if ($("stopTimer")) {

    $("stopTimer").addEventListener("click", async () => {

        if (state.running) {

            state.accumulated =
                currentSessionSeconds();

        }

        clearInterval(state.interval);

        state.running = false;
        state.paused = false;

        const seconds = state.accumulated;

        const startedAt = state.sessionStartedAt;

        $("activeDialog").close();

        if (seconds > 0 && startedAt) {

            try {

                await api("/api/focus", {
                    method: "POST",

                    body: JSON.stringify({
                        duration_seconds: seconds,
                        started_at: startedAt
                    })
                });

                await loadDashboard();

                notify("Your focus session has been saved!");

            } catch (error) {

                showError(error);

            }

        }

        state.accumulated = 0;
        state.remaining = 0;
        state.sessionStartedAt = null;

    });

}


// ==========================================
// INITIALIZE DASHBOARD
// ==========================================

loadDashboard();
