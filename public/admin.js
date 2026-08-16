const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const pendingItems = document.getElementById("pendingItems");
const pendingCount = document.getElementById("pendingCount");
const threadMessages = document.getElementById("threadMessages");
const threadHeader = document.getElementById("threadHeader");
const currentSessionLabel = document.getElementById("currentSessionLabel");
const replyBox = document.getElementById("replyBox");
const replyInput = document.getElementById("replyInput");
const replySendBtn = document.getElementById("replySendBtn");
const maintenanceSwitch = document.getElementById("maintenanceSwitch");

let adminKey = sessionStorage.getItem("echo_admin_key");
let currentSessionId = null;
let currentPendingMessageId = null;

function authHeaders() {
  return { "X-Admin-Key": adminKey, "Content-Type": "application/json" };
}

async function tryLogin(pw) {
  adminKey = pw;
  const res = await fetch("/api/admin/check", { headers: authHeaders() });
  if (res.ok) {
    sessionStorage.setItem("echo_admin_key", adminKey);
    loginScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
    boot();
  } else {
    loginError.classList.remove("hidden");
    adminKey = null;
  }
}

loginBtn.addEventListener("click", () => tryLogin(passwordInput.value));
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryLogin(passwordInput.value);
});

async function loadPending() {
  const res = await fetch("/api/admin/pending", { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  const items = data.pending || [];
  pendingCount.textContent = `(${items.length})`;
  pendingItems.innerHTML = "";
  for (const item of items) {
    const div = document.createElement("div");
    div.className = "pending-item";
    const date = new Date(item.created_at).toLocaleTimeString();
    div.innerHTML = `<strong>${item.session_id.slice(0, 8)}…</strong>
      <div class="preview">${escapeHtml(item.content)}</div>
      <div class="time">${date}</div>`;
    div.addEventListener("click", () => openThread(item.session_id, item.id));
    pendingItems.appendChild(div);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function openThread(sessionId, pendingMessageId) {
  currentSessionId = sessionId;
  currentPendingMessageId = pendingMessageId || null;
  threadHeader.classList.remove("hidden");
  currentSessionLabel.textContent = sessionId;
  replyBox.classList.remove("hidden");

  const res = await fetch(`/api/admin/thread?session_id=${sessionId}`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  threadMessages.innerHTML = "";
  for (const m of data.messages || []) {
    const div = document.createElement("div");
    div.className = "thread-bubble " + (m.role === "user" ? "user" : "echo");
    const tag = m.source ? `<span class="tag">${m.source === "gemini" ? "réponse auto (Gemini)" : "toi"}</span>` : "";
    div.innerHTML = `${escapeHtml(m.content)}${tag}`;
    threadMessages.appendChild(div);
  }
  threadMessages.scrollTop = threadMessages.scrollHeight;
}

replySendBtn.addEventListener("click", async () => {
  const text = replyInput.value.trim();
  if (!text || !currentSessionId) return;
  await fetch("/api/admin/reply", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      session_id: currentSessionId,
      message_id: currentPendingMessageId,
      reply: text,
    }),
  });
  replyInput.value = "";
  await openThread(currentSessionId, null);
  await loadPending();
});

maintenanceSwitch.addEventListener("change", async () => {
  await fetch("/api/admin/maintenance", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ on: maintenanceSwitch.checked }),
  });
});

async function loadMaintenanceState() {
  const res = await fetch("/api/status");
  const data = await res.json();
  maintenanceSwitch.checked = !!data.maintenance;
}

function boot() {
  loadPending();
  loadMaintenanceState();
  setInterval(loadPending, 5000);
}

if (adminKey) {
  fetch("/api/admin/check", { headers: authHeaders() }).then((res) => {
    if (res.ok) {
      loginScreen.classList.add("hidden");
      dashboard.classList.remove("hidden");
      boot();
    }
  });
}
