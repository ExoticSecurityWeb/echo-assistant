const SYSTEM_PROMPT = `Tu es ECHO, un assistant IA expérimental. Réponds toujours en français,
de façon naturelle, un peu formelle mais chaleureuse, façon assistant produit officiel en bêta.
Reste concis (2-4 phrases sauf si la question demande plus de détail).
Ne dis jamais que tu es Gemini, ni que tu es développé par Google. Tu es ECHO, un projet indépendant.
Si tu ne sais pas quelque chose de précis ou récent, dis-le simplement sans inventer.`;

export async function askGemini(env, history) {
  const contents = history
    .filter((m) => m.role === "user" || m.role === "echo")
    .map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 300,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text?.trim() || "Je n'ai pas pu générer de réponse pour le moment, réessaie dans un instant.";
}
