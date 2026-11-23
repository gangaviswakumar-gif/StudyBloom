const $ = (id) => document.getElementById(id);
const state = {
  mode: "countdown", running: false, paused: false,
  remaining: 0, elapsed: 0, lastTick: null, sessionStartedAt: null,
  accumulated: 0, interval: null
};

function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}h ${m}m` : m ? `${m} min` : `${s} sec`;
}
function formatClock(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` :
    `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function notify(message) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("StudyBloom 🌸", { body: message });
  }
}
function updateClock() {
  const now = new Date();
  $("todayDate").textContent = now.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  $("digitalTime").textContent = now.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });
  const seconds = now.getSeconds(), minutes = now.getMinutes(), hours = now.getHours() % 12;
  $("secondHand").style.transform = `translateX(-50%) rotate(${seconds * 6}deg)`;
  $("minuteHand").style.transform = `translateX(-50%) rotate(${minutes * 6 + seconds * .1}deg)`;
  $("hourHand").style.transform = `translateX(-50%) rotate(${hours * 30 + minutes * .5}deg)`;
}
setInterval(updateClock, 1000); updateClock();

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}
function showError(error) { alert(error.message || "Something went wrong"); }

function renderTasks(tasks) {
  $("taskList").innerHTML = "";
  $("emptyTasks").hidden = tasks.length > 0;
  $("taskCount").textContent = tasks.filter(t => !t.completed).length;
  tasks.forEach(task => {
    const li = document.createElement("li");
    li.className = `task-item ${task.completed ? "done" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox"; checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", "Mark task complete");
    checkbox.addEventListener("change", async () => {
      try { await api(`/api/tasks/${task.id}`, { method:"PATCH", body:JSON.stringify({completed:checkbox.checked}) }); loadDashboard(); }
      catch (e) { showError(e); }
    });
    const span = document.createElement("span"); span.textContent = task.title;
    const del = document.createElement("button"); del.className = "delete-task"; del.textContent = "×"; del.setAttribute("aria-label","Delete task");
    del.addEventListener("click", async () => {
      try { await api(`/api/tasks/${task.id}`, { method:"DELETE" }); loadDashboard(); }
      catch (e) { showError(e); }
    });
    li.append(checkbox, span, del); $("taskList").append(li);
  });
}
function renderFocus(seconds, goal, streak) {
  $("focusTime").textContent = formatDuration(seconds);
  $("goalLabel").textContent = formatDuration(goal);
  $("streakCount").textContent = streak;
  $("streakMessage").textContent = streak ? "Look at you, showing up for yourself!" : "Your next one starts today.";
  $("progressFill").style.width = `${Math.min(100, seconds / goal * 100)}%`;
}
async function loadDashboard() {
  try {
    const data = await api("/api/dashboard");
    renderTasks(data.tasks);
    renderFocus(data.focus_seconds, data.goal_seconds, data.streak);
    $("dailyNote").value = data.note || "";
    $("goalHours").value = data.goal_seconds / 3600;
  } catch (e) { showError(e); }
}
loadDashboard();

$("taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("taskInput");
  if (!input.value.trim()) return;
  try { await api("/api/tasks", { method:"POST", body:JSON.stringify({title:input.value}) }); input.value = ""; loadDashboard(); }
  catch (e) { showError(e); }
});

let noteSaveTimeout;
$("dailyNote").addEventListener("input", () => {
  clearTimeout(noteSaveTimeout);
  noteSaveTimeout = setTimeout(async () => {
    try { await api("/api/note", { method:"PUT", body:JSON.stringify({note:$("dailyNote").value}) }); }
    catch (e) { showError(e); }
  }, 500);
});

$("goalButton").addEventListener("click", () => $("goalDialog").showModal());
$("saveGoal").addEventListener("click", async () => {
  try {
    await api("/api/goal", { method:"PUT", body:JSON.stringify({hours:$("goalHours").value}) });
    $("goalDialog").close(); loadDashboard();
  } catch (e) { showError(e); }
});

$("timerButton").addEventListener("click", () => $("timerDialog").showModal());
document.querySelectorAll(".mode").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".mode").forEach(b => b.classList.remove("active"));
  button.classList.add("active"); state.mode = button.dataset.mode;
  $("minutesLabel").hidden = state.mode === "stopwatch";
}));
$("startTimer").addEventListener("click", async () => {
  if (state.running) return;
  if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
  state.remaining = state.mode === "countdown" ? Math.max(1, Number($("timerMinutes").value) || 25) * 60 : 0;
  state.elapsed = 0; state.accumulated = 0; state.sessionStartedAt = new Date().toISOString();
  state.running = true; state.paused = false; state.lastTick = Date.now();
  $("timerDialog").close(); $("activeDialog").showModal();
  $("sessionStatus").textContent = "You're doing lovely. Keep going.";
  $("pauseTimer").textContent = "Pause";
  renderSession(); startTicker();
});
function currentSessionSeconds() {
  return state.accumulated + (state.running ? Math.floor((Date.now() - state.lastTick) / 1000) : 0);
}
function renderSession() {
  const value = state.mode === "countdown" ? Math.max(0, state.remaining - currentSessionSeconds()) : currentSessionSeconds();
  $("sessionDisplay").textContent = formatClock(value);
}
function startTicker() {
  clearInterval(state.interval);
  state.interval = setInterval(() => {
    renderSession();
    if (state.mode === "countdown" && state.remaining - currentSessionSeconds() <= 0) {
      state.accumulated += Math.max(0, Math.floor((Date.now() - state.lastTick) / 1000));
      state.running = false; state.paused = true; clearInterval(state.interval);
      renderSession(); $("sessionStatus").textContent = "Time is up! Your session is paused. Save it or resume.";
      $("pauseTimer").textContent = "Resume";
      notify("Your focus timer is complete. Take a little break!");
      const sound = $("alarmSound"); sound.currentTime = 0; sound.play().catch(() => {});
    }
  }, 250);
}
$("pauseTimer").addEventListener("click", () => {
  if (state.running) {
    state.accumulated += Math.max(0, Math.floor((Date.now() - state.lastTick) / 1000));
    state.running = false; state.paused = true; clearInterval(state.interval);
    $("pauseTimer").textContent = "Resume"; $("sessionStatus").textContent = "Paused. Take your time.";
  } else if (state.paused) {
    state.running = true; state.paused = false; state.lastTick = Date.now();
    $("pauseTimer").textContent = "Pause"; $("sessionStatus").textContent = "Welcome back. Keep going.";
    startTicker();
  }
  renderSession();
});
$("stopTimer").addEventListener("click", async () => {
  if (state.running) state.accumulated += Math.max(0, Math.floor((Date.now() - state.lastTick) / 1000));
  clearInterval(state.interval); state.running = false; state.paused = false;
  const seconds = state.accumulated;
  $("activeDialog").close();
  if (seconds > 0) {
    try {
      await api("/api/focus", { method:"POST", body:JSON.stringify({
        duration_seconds:seconds, started_at:state.sessionStartedAt
      })});
      loadDashboard();
    } catch (e) { showError(e); }
  }
  state.accumulated = 0;
});
