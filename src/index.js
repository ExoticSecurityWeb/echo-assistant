import { askGemini } from "./gemini.js";

const REPLY_DELAY_MS = 5 * 60 * 1000; // 5 minutes avant fallback IA

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isAdmin(request, env) {
  const key = request.headers.get("X-Admin-Key");
  return key && env.ADMIN_PASSWORD && key === env.ADMIN_PASSWORD;
}

async function getSetting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first();
  return row ? row.value : null;
}

async function setSetting(env, key, value) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(key, value)
    .run();
}

async function ensureSession(env, sessionId) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO sessions (id, created_at) VALUES (?, ?)"
  )
    .bind(sessionId, Date.now())
    .run();
}

async function handleChatPost(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.session_id || !body.message) {
    return json({ error: "session_id et message requis" }, 400);
  }
  const maintenance = await getSetting(env, "maintenance");
  if (maintenance === "1") {
    return json({ error: "maintenance" }, 503);
  }

  await ensureSession(env, body.session_id);

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO messages (session_id, role, content, created_at, needs_reply, deadline, replied)
     VALUES (?, 'user', ?, ?, 1, ?, 0)`
  )
    .bind(body.session_id, body.message.slice(0, 4000), now, now + REPLY_DELAY_MS)
    .run();

  return json({ ok: true });
}

async function handleChatPoll(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const since = parseInt(url.searchParams.get("since") || "0", 10);
  if (!sessionId) return json({ error: "session_id requis" }, 400);

  const { results } = await env.DB.prepare(
    `SELECT id, role, content, created_at FROM messages
     WHERE session_id = ? AND created_at > ?
     ORDER BY created_at ASC`
  )
    .bind(sessionId, since)
    .all();

  return json({ messages: results || [] });
}

async function handleStatus(env) {
  const maintenance = (await getSetting(env, "maintenance")) === "1";
  return json({ maintenance });
}

async function handleAdminPending(env) {
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.session_id, m.content, m.created_at
     FROM messages m
     WHERE m.role = 'user' AND m.needs_reply = 1
     ORDER BY m.created_at ASC`
  ).all();
  return json({ pending: results || [] });
}

async function handleAdminSessions(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, label FROM sessions ORDER BY created_at DESC`
  ).all();
  return json({ sessions: results || [] });
}

async function handleAdminThread(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) return json({ error: "session_id requis" }, 400);
  const { results } = await env.DB.prepare(
    `SELECT id, role, content, source, created_at FROM messages
     WHERE session_id = ? ORDER BY created_at ASC`
  )
    .bind(sessionId)
    .all();
  return json({ messages: results || [] });
}

async function handleAdminReply(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.session_id || !body.message_id || !body.reply) {
    return json({ error: "session_id, message_id et reply requis" }, 400);
  }
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO messages (session_id, role, content, source, created_at, needs_reply, replied)
     VALUES (?, 'echo', ?, 'human', ?, 0, 0)`
  )
    .bind(body.session_id, body.reply.slice(0, 4000), now)
    .run();

  await env.DB.prepare(
    `UPDATE messages SET needs_reply = 0, replied = 1 WHERE id = ?`
  )
    .bind(body.message_id)
    .run();

  return json({ ok: true });
}

async function handleAdminMaintenance(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.on !== "boolean") {
    return json({ error: "on (boolean) requis" }, 400);
  }
  await setSetting(env, "maintenance", body.on ? "1" : "0");
  return json({ ok: true, maintenance: body.on });
}

// Traite les messages en attente depuis plus de 5 min : Gemini répond à ta place
async function processOverdueMessages(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT id, session_id FROM messages
     WHERE role = 'user' AND needs_reply = 1 AND deadline <= ?`
  )
    .bind(now)
    .all();

  for (const msg of results || []) {
    try {
      const { results: history } = await env.DB.prepare(
        `SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 30`
      )
        .bind(msg.session_id)
        .all();

      const reply = await askGemini(env, history || []);

      await env.DB.prepare(
        `INSERT INTO messages (session_id, role, content, source, created_at, needs_reply, replied)
         VALUES (?, 'echo', ?, 'gemini', ?, 0, 0)`
      )
        .bind(msg.session_id, reply, Date.now())
        .run();

      await env.DB.prepare(
        `UPDATE messages SET needs_reply = 0, replied = 1 WHERE id = ?`
      )
        .bind(msg.id)
        .run();
    } catch (err) {
      // On laisse le message en attente, il sera retenté à la prochaine passe cron
      console.error("Erreur fallback Gemini:", err);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChatPost(request, env);
    }
    if (url.pathname === "/api/chat/poll" && request.method === "GET") {
      return handleChatPoll(request, env);
    }
    if (url.pathname === "/api/status" && request.method === "GET") {
      return handleStatus(env);
    }

    if (url.pathname.startsWith("/api/admin/")) {
      if (!isAdmin(request, env)) {
        return json({ error: "unauthorized" }, 401);
      }
      if (url.pathname === "/api/admin/pending" && request.method === "GET") {
        return handleAdminPending(env);
      }
      if (url.pathname === "/api/admin/sessions" && request.method === "GET") {
        return handleAdminSessions(env);
      }
      if (url.pathname === "/api/admin/thread" && request.method === "GET") {
        return handleAdminThread(request, env);
      }
      if (url.pathname === "/api/admin/reply" && request.method === "POST") {
        return handleAdminReply(request, env);
      }
      if (url.pathname === "/api/admin/maintenance" && request.method === "POST") {
        return handleAdminMaintenance(request, env);
      }
      if (url.pathname === "/api/admin/check" && request.method === "GET") {
        return json({ ok: true });
      }
    }

    // Sinon, sert les fichiers statiques (chat + admin)
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(processOverdueMessages(env));
  },
};
