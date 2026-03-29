exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const FILE_PATH = "data/sessions.json";
  const API_BASE = `https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`;

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server misconfigured: missing env vars" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  let sha, currentSessions = [];
  try {
    const res = await fetch(API_BASE, { headers });
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
      currentSessions = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
    } else if (res.status !== 404) {
      const err = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: "GitHub fetch failed", detail: err }) };
    }
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "GitHub fetch error", detail: e.message }) };
  }

  if (body.action === "save") {
    const session = body.session;
    if (!session || !session.id || !session.date) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid session object" }) };
    }
    currentSessions = currentSessions.filter(s => s.id !== session.id);
    currentSessions.push(session);
  } else if (body.action === "delete") {
    currentSessions = currentSessions.filter(s => s.id !== body.id);
  } else if (body.action === "update_goals") {
    currentSessions = currentSessions.filter(s => s.id !== "__goals__");
    currentSessions.push({ id: "__goals__", ...body.goals });
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) };
  }

  const newContent = Buffer.from(JSON.stringify(currentSessions, null, 2)).toString("base64");
  const commitPayload = {
    message: `practice: update sessions [${new Date().toISOString().slice(0, 10)}]`,
    content: newContent,
    ...(sha ? { sha } : {}),
  };

  try {
    const putRes = await fetch(API_BASE, {
      method: "PUT",
      headers,
      body: JSON.stringify(commitPayload),
    });
    if (!putRes.ok) {
      const err = await putRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: "GitHub commit failed", detail: err }) };
    }
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "GitHub commit error", detail: e.message }) };
  }

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true }),
  };
};
