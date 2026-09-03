"use strict";

const express = require("express");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || "/data/leaderboard.db";
const PORT = process.env.PORT || 3000;
const MAX_NAME_LEN = 20;
const MAX_ROWS_KEPT = 200; // bounds table growth; the API only ever serves the top 10
const MAX_SCORE = 300000;
const MAX_DISTANCE = 20000;

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(
  "CREATE TABLE IF NOT EXISTS scores (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "name TEXT NOT NULL," +
    "score INTEGER NOT NULL," +
    "distance INTEGER NOT NULL," +
    "created_at TEXT NOT NULL DEFAULT (datetime('now'))" +
    ")"
);

var topTenStmt = db.prepare(
  "SELECT name, score, distance FROM scores ORDER BY score DESC, created_at ASC LIMIT 10"
);
var insertStmt = db.prepare(
  "INSERT INTO scores (name, score, distance) VALUES (?, ?, ?)"
);
var pruneStmt = db.prepare(
  "DELETE FROM scores WHERE id NOT IN (SELECT id FROM scores ORDER BY id DESC LIMIT ?)"
);

// Strips ASCII control characters (codes 0-31 and 127) by character code
// rather than a regex, collapses whitespace, trims, caps length. The result
// is rendered client-side as plain textContent, never innerHTML — this
// sanitizing is about data hygiene, not XSS (the client already prevents that).
function sanitizeName(raw) {
  if (typeof raw !== "string") return null;
  var stripped = "";
  for (var i = 0; i < raw.length; i++) {
    var code = raw.charCodeAt(i);
    if (code > 31 && code !== 127) stripped += raw.charAt(i);
  }
  var collapsed = stripped.split(/\s+/).join(" ").trim();
  if (!collapsed) return null;
  return collapsed.slice(0, MAX_NAME_LEN);
}

var app = express();
app.use(express.json({ limit: "2kb" }));

app.get("/healthz", function (req, res) {
  res.type("text/plain").send("ok");
});

app.get("/api/leaderboard", function (req, res) {
  res.json(topTenStmt.all());
});

app.post("/api/leaderboard", function (req, res) {
  var body = req.body || {};
  var name = sanitizeName(body.name);
  var score = Number(body.score);
  var distance = Number(body.distance);

  if (!name) {
    return res.status(400).json({ error: "A valid name is required." });
  }
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return res.status(400).json({ error: "Invalid score." });
  }
  if (!Number.isFinite(distance) || distance < 0 || distance > MAX_DISTANCE) {
    return res.status(400).json({ error: "Invalid distance." });
  }

  insertStmt.run(name, Math.round(score), Math.round(distance));
  pruneStmt.run(MAX_ROWS_KEPT);

  res.status(201).json(topTenStmt.all());
});

app.listen(PORT, function () {
  console.log("battery-run leaderboard api listening on " + PORT);
});
