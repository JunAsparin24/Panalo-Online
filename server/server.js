/* =========================================================
   server.js — The Trivia Night web server (runs on Render, or any
   computer with Node.js: `npm start`, then open
   http://localhost:3000).

   It serves the game, and runs the buzzers for any number of
   games at once, like Jackbox: each game is a ROOM with a
   4-letter code.
     - the main address  /       players type the code to join
                                 (/?room=CODE skips typing it)
     - the game          /play   whoever opens it hosts a new room
                                 (the game asks for one: POST /api/rooms)
     - the host's phone  /host?room=CODE  (+ a 4-digit host code)

   The game's own browser proves it's the host with a secret
   HOST KEY (sent in the X-Host-Key header), so players can never
   unlock buzzers, see answers or read the secret wagers.

   Everything lives in memory: if the server restarts, rooms are
   gone and the game simply makes a new one. Rooms nobody has
   used for ROOM_EXPIRE_HOURS are cleaned up.

   No packages needed — only Node.js itself (version 18 or newer).
   ========================================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const PROJECT_ROOT = path.resolve(__dirname, "..");

const ROOM_EXPIRE_HOURS = 8;
const MAX_ROOMS = 1000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // a question with a picture is ~100 KB
const PLAYER_TIMEOUT_MS = 6000;         // a phone that stops checking in no longer counts
const ROOM_CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O (they look like 1 and 0)

/* =========================================================
   ROOMS
   ========================================================= */

const rooms = new Map(); // code -> room

function createRoom() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => ROOM_CODE_LETTERS[crypto.randomInt(ROOM_CODE_LETTERS.length)]).join("");
  } while (rooms.has(code));

  const room = {
    code,
    hostKey: crypto.randomBytes(18).toString("hex"),
    hostCode: String(crypto.randomInt(10000)).padStart(4, "0"), // typed in on the host's phone
    lastUsed: Date.now(),

    // Buzzers
    open: false,    // buzzers only work while the game has a question up
    timeUp: false,  // the 30 seconds to buzz ran out on this question
    locked: false,
    winner: null,   // { id, name, color } of the team that buzzed first
    buzzId: 0,      // goes up every time someone buzzes or the host unlocks
    teams: [],      // sent by the game: [{ id, name, color }]
    blocked: [],    // ids of teams that already had their go at this question
    players: new Map(), // phone id -> when it last checked in

    // Host's phone: the open question + answer (never sent to players),
    // and the commands it sends back to the game
    hostQuestion: null,
    commandSeq: 0,
    commands: [],
    controlInfo: null,

    // The host's theme color { hue, saturation, lightness } (null = the original red),
    // so the phones match the game
    theme: null,

    // Final Wager: amounts stay secret — phones only see WHO has locked in
    fw: { active: false, phase: "", category: "", maxes: {}, wagers: {} },
  };
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  const room = rooms.get(String(code || "").toUpperCase());
  if (room) room.lastUsed = Date.now();
  return room || null;
}

// Clean up rooms nobody has used for a while
setInterval(() => {
  const cutoff = Date.now() - ROOM_EXPIRE_HOURS * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.lastUsed < cutoff) rooms.delete(code);
  }
}, 10 * 60 * 1000).unref();

function countPlayers(room) {
  const cutoff = Date.now() - PLAYER_TIMEOUT_MS;
  let count = 0;
  for (const [id, seen] of room.players) {
    if (seen > cutoff) count += 1;
    else room.players.delete(id);
  }
  return count;
}

function getFinalWagerState(room) {
  const { fw } = room;
  if (!fw.active) return { active: false };
  return {
    active: true,
    phase: fw.phase,
    category: fw.category,
    maxes: fw.maxes,
    lockedTeamIds: Object.keys(fw.wagers),
  };
}

// What every phone may see — never answers or wager amounts
function getPublicState(room) {
  return {
    room: room.code,
    open: room.open,
    timeUp: room.timeUp,
    locked: room.locked,
    winner: room.winner,
    buzzId: room.buzzId,
    teams: room.teams,
    blocked: room.blocked,
    players: countPlayers(room),
    finalWager: getFinalWagerState(room),
    theme: room.theme,
    commandSeq: room.commandSeq, // the game fetches new host commands when this changes
  };
}

/* =========================================================
   API
   ========================================================= */

const text = (value, maxLength) => String(value == null ? "" : value).slice(0, maxLength);
const wholeNumber = (value) => Math.round(Number(value)) || 0;

// Every handler gets { room, body, rawBody, query, isHost } and returns [status, data].
// body is always an object ({} if nothing was sent); rawBody is exactly what was
// sent, so "null" (e.g. no question open) stays null
const routes = {
  // --- Players ------------------------------------------------------
  "GET /api/state": ({ room }) => [200, getPublicState(room)],

  "POST /api/buzz": ({ room, body }) => {
    const team = room.teams.find((item) => item.id === body.teamId);
    if (!team) return [400, { accepted: false, reason: "unknown team" }];

    // First one in wins — Node handles one request at a time, so this is fair
    let accepted = false;
    if (room.open && !room.locked && !room.blocked.includes(team.id)) {
      room.locked = true;
      room.winner = { id: team.id, name: team.name, color: team.color };
      room.buzzId += 1;
      accepted = true;
    }
    return [200, { accepted, state: getPublicState(room) }];
  },

  // A phone locks in (or changes) its team's wager, until the question is shown
  "POST /api/fw/wager": ({ room, body }) => {
    const { fw } = room;
    const teamId = text(body.teamId, 40);
    const accepted = fw.active && fw.phase === "wager" && Object.hasOwn(fw.maxes, teamId);
    let amount = 0;
    if (accepted) {
      amount = Math.max(0, Math.min(fw.maxes[teamId], wholeNumber(body.amount)));
      fw.wagers[teamId] = amount;
    }
    return [200, { accepted, amount, finalWager: getFinalWagerState(room) }];
  },

  // --- The host's game ---------------------------------------------
  "POST /api/teams": ({ room, body, isHost }) => {
    if (!isHost) return forbidden();
    room.teams = (Array.isArray(body) ? body : []).slice(0, 8).map((team) => ({
      id: text(team.id, 40),
      name: text(team.name, 24),
      color: /^#[0-9a-f]{6}$/i.test(team.color) ? team.color : "#f4c76a",
    }));
    return [200, getPublicState(room)];
  },

  // The game says whether a question is up, and which teams stay locked out
  "POST /api/unlock": ({ room, body, isHost }) => {
    if (!isHost) return forbidden();
    room.open = Boolean(body.open);
    room.timeUp = Boolean(body.timeUp);
    room.blocked = (Array.isArray(body.blocked) ? body.blocked : []).map((id) => text(id, 40));
    if (room.locked) {
      room.locked = false;
      room.winner = null;
      room.buzzId += 1;
    }
    return [200, getPublicState(room)];
  },

  // The theme color picked on the Set Up Game screen (null = the original red)
  "POST /api/theme": ({ room, body, isHost }) => {
    if (!isHost) return forbidden();
    const numbers = [body.hue, body.saturation, body.lightness].map(Number);
    room.theme = numbers.every(Number.isFinite)
      ? { hue: numbers[0], saturation: numbers[1], lightness: numbers[2] }
      : null;
    return [200, { ok: true }];
  },

  // The open question and its answer, for the host's phone (null = back on the board)
  "POST /api/question": ({ room, rawBody, isHost }) => {
    if (!isHost) return forbidden();
    room.hostQuestion = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : null;
    return [200, { ok: true }];
  },

  "GET /api/host-info": ({ room, isHost }) => {
    if (!isHost) return forbidden();
    return [200, { code: room.hostCode }];
  },

  // Final Wager: the chosen category, and how much each team may wager
  "POST /api/fw/setup": ({ room, body, isHost }) => {
    if (!isHost) return forbidden();
    // Plain lookup tables (no built-in keys), since team ids come from the browser
    const maxes = Object.create(null);
    Object.entries(body.maxes || {}).forEach(([teamId, max]) => { maxes[text(teamId, 40)] = Math.max(0, wholeNumber(max)); });
    room.fw = { active: true, phase: "wager", category: text(body.category, 80), maxes, wagers: Object.create(null) };
    return [200, getFinalWagerState(room)];
  },

  // "question" = wagers are locked in; "reveal" = answering is over
  "POST /api/fw/phase": ({ room, body, isHost }) => {
    if (!isHost) return forbidden();
    room.fw.phase = text(body.phase, 20);
    return [200, getFinalWagerState(room)];
  },

  // The secret wagers — only the host's game can ask
  "GET /api/fw/results": ({ room, isHost }) => {
    if (!isHost) return forbidden();
    return [200, { wagers: room.fw.wagers }];
  },

  "POST /api/fw/end": ({ room, isHost }) => {
    if (!isHost) return forbidden();
    room.fw.active = false;
    return [200, getFinalWagerState(room)];
  },

  // The game collects the host-phone commands it hasn't run yet
  "GET /api/commands": ({ room, query, isHost }) => {
    if (!isHost) return forbidden();
    const after = wholeNumber(query.get("after"));
    return [200, { commands: room.commands.filter((command) => command.id > after) }];
  },

  // The game says what's on screen, for the host's phone
  "POST /api/control": ({ room, rawBody, isHost }) => {
    if (!isHost) return forbidden();
    room.controlInfo = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : null;
    return [200, { ok: true }];
  },

  // --- The host's phone (needs the 4-digit host code) ----------------
  "GET /api/host": ({ room, query }) => {
    if (query.get("code") !== room.hostCode) return [403, { error: "wrong code" }];
    return [200, { question: room.hostQuestion, locked: room.locked, winner: room.winner, control: room.controlInfo, theme: room.theme }];
  },

  // { action: "goto", target: "round" | "finalWager", round }
  // or { action: "fwPick", categoryIndex, questionIndex } or { action: "fwRandom" }
  "POST /api/host/command": ({ room, body, query }) => {
    if (query.get("code") !== room.hostCode) return [403, { error: "wrong code" }];
    const optionalNumber = (value) => (value === null || value === undefined ? null : wholeNumber(value));
    room.commandSeq += 1;
    room.commands = [...room.commands, {
      id: room.commandSeq,
      action: text(body.action, 20),
      target: text(body.target, 20),
      round: optionalNumber(body.round),
      categoryIndex: optionalNumber(body.categoryIndex),
      questionIndex: optionalNumber(body.questionIndex),
    }].slice(-20);
    return [200, { ok: true, id: room.commandSeq }];
  },
};

function forbidden() {
  return [403, { error: "Only the host can do that" }];
}

async function handleApi(request, response, url) {
  // A new game: a new room (or the same one again, if the host's game still has its key)
  if (url.pathname === "/api/rooms" && request.method === "POST") {
    const body = (await readJsonBody(request)) || {};
    let room = getRoom(body.room);
    if (!room || room.hostKey !== body.hostKey) {
      if (rooms.size >= MAX_ROOMS) return sendJson(response, 503, { error: "Too many games right now. Try again later." });
      room = createRoom();
    }
    return sendJson(response, 200, { room: room.code, hostKey: room.hostKey, hostCode: room.hostCode });
  }

  const route = routes[`${request.method} ${url.pathname}`];
  if (!route) return sendJson(response, 404, { error: "Not found" });

  const room = getRoom(url.searchParams.get("room"));
  if (!room) return sendJson(response, 404, { error: "No game with that code" });

  // Phones say who they are when they check in, so they can be counted
  const playerId = url.searchParams.get("player");
  if (playerId) room.players.set(playerId.slice(0, 40), Date.now());

  const rawBody = request.method === "POST" ? await readJsonBody(request) : null;
  const body = rawBody && typeof rawBody === "object" ? rawBody : {};
  const isHost = request.headers["x-host-key"] === room.hostKey;
  const [status, data] = route({ room, body, rawBody, query: url.searchParams, isHost });
  return sendJson(response, status, data);
}

/* =========================================================
   FILES (the game, the buzzer page, the host page)
   ========================================================= */

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
};

const PAGE_ALIASES = {
  "/": "buzzer/index.html",       // players: enter the code
  "/play": "index.html",          // hosts: the game itself
  "/play/": "index.html",
  "/buzz": "buzzer/index.html",
  "/buzz/": "buzzer/index.html",
  "/host": "host/index.html",
  "/host/": "host/index.html",
};

function sendFile(response, urlPath) {
  let relative;
  try {
    relative = PAGE_ALIASES[urlPath] || decodeURIComponent(urlPath).replace(/^\/+/, "");
  } catch (error) {
    return sendText(response, 400, "Bad address");
  }

  // Never serve hidden files (.git), the server itself, or installed packages
  if (/(^|\/)\./.test(relative) || /^(server|node_modules)\//.test(relative) || relative === "package.json") {
    return sendText(response, 404, "Not found");
  }

  const fullPath = path.resolve(PROJECT_ROOT, relative);
  if (!fullPath.startsWith(PROJECT_ROOT + path.sep)) return sendText(response, 404, "Not found");

  fs.readFile(fullPath, (error, contents) => {
    if (error) return sendText(response, 404, "Not found");
    const type = MIME_TYPES[path.extname(fullPath).toLowerCase()] || "application/octet-stream";
    // Pages and code always come fresh (so updates show up straight away); pictures and sounds can be kept
    const cache = /\.(html|js|css)$/.test(fullPath) ? "no-cache" : "public, max-age=86400";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
    response.end(contents);
  });
}

/* =========================================================
   HELPERS
   ========================================================= */

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function sendText(response, status, message) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

// The game sends JSON as plain text (no Content-Type), so any body is read as JSON
function readJsonBody(request) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        request.destroy();
        resolve({});
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        resolve({});
      }
    });
    request.on("error", () => resolve({}));
  });
}

/* =========================================================
   START
   ========================================================= */

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else if (request.method === "GET" || request.method === "HEAD") {
      sendFile(response, url.pathname);
    } else {
      sendText(response, 404, "Not found");
    }
  } catch (error) {
    console.error(`Problem with ${request.url}:`, error);
    if (!response.headersSent) sendText(response, 500, "Server error");
  }
});

server.listen(PORT, () => {
  console.log(`Trivia Night is running at http://localhost:${PORT}`);
});
