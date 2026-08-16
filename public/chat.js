const chatArea = document.getElementById("chatArea");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const typingIndicator = document.getElementById("typingIndicator");
const appEl = document.getElementById("app");
const maintenanceEl = document.getElementById("maintenanceScreen");

let sessionId = localStorage.getItem("echo_session_id");
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem("echo_session_id", sessionId);
}

let lastTimestamp = parseInt(localStorage.getItem("echo_last_ts_" + sessionId) || "0", 10);

function saveLastTimestamp(ts) {
  lastTimestamp = ts;
  localStorage.setItem("echo_last_ts_" + sessionId, String(ts));
}

function addBubble(role, content) {
  const div = document.createElement("div");
  div.className = "bubble " + (role === "user" ? "user" : "echo");
  div.textContent = content;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function restoreHistory(messages) {
  chatArea.innerHTML = "";
  for (const m of messages) {
    addBubble(m.role, m.content);
  }
  if (messages.length) {
    saveLastTimestamp(messages[messages.length - 1].created_at);
  }
}

async function checkStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (data.maintenance) {
      appEl.classList.add("hidden");
      maintenanceEl.classList.remove("hidden");
      return true;
    }
  } catch (e) {}
  return false;
}

async function loadHistory() {
  const res = await fetch(`/api/chat/poll?session_id=${sessionId}&since=0`);
  const data = await res.json();
  if (data.messages && data.messages.length) {
    restoreHistory(data.messages);
  } else {
    addBubble(
      "echo",
      "Bonjour, je suis ECHO, assistant IA expérimental actuellement en accès restreint (bêta fermée). Pose-moi tes questions."
    );
  }
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  input.style.height = "auto";
  addBubble("user", text);

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message: text }),
  });

  if (res.status === 503) {
    checkStatus();
  }
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 100) + "px";
});

let showingTyping = false;

async function poll() {
  try {
    const res = await fetch(`/api/chat/poll?session_id=${sessionId}&since=${lastTimestamp}`);
    const data = await res.json();
    const newEcho = (data.messages || []).filter((m) => m.role === "echo");
    if (newEcho.length && !showingTyping) {
      showingTyping = true;
      typingIndicator.classList.remove("hidden");
      const delay = 1200 + Math.random() * 2200;
      setTimeout(() => {
        for (const m of newEcho) addBubble("echo", m.content);
        typingIndicator.classList.add("hidden");
        showingTyping = false;
      }, delay);
    }
    if (data.messages && data.messages.length) {
      saveLastTimestamp(data.messages[data.messages.length - 1].created_at);
    }
  } catch (e) {}
}

(async function init() {
  const inMaintenance = await checkStatus();
  if (inMaintenance) return;
  await loadHistory();
  setInterval(poll, 3000);
  setInterval(checkStatus, 15000);
})();
