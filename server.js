const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*" }
});

// ===== MySQL connection =====
// For Render, replace host, user, password with your cloud MySQL credentials
async function connectDB() {
  return await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "chat_app"
  });
}

// ===== JWT middleware =====
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });

  jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY", (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = decoded;
    next();
  });
}

// ===== SIGNUP =====
app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields required" });

  try {
    const db = await connectDB();
    const [exists] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
    if (exists.length > 0)
      return res.status(400).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);
    await db.execute("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [name, email, hashed]);

    res.json({ message: "Signup success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const db = await connectDB();
    const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0)
      return res.status(400).json({ message: "Invalid email or password" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: user.id, name: user.username }, process.env.JWT_SECRET || "SECRET_KEY", { expiresIn: "7d" });

    res.json({ message: "Login success", token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===== CREATE CHANNEL =====
app.post("/channels", auth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Channel name required" });

  try {
    const db = await connectDB();
    await db.execute("INSERT INTO channels (name) VALUES (?)", [name]);
    res.json({ message: "Channel created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===== GET CHANNEL LIST =====
app.get("/channels", auth, async (req, res) => {
  try {
    const db = await connectDB();
    const [rows] = await db.execute("SELECT * FROM channels");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===== GET MESSAGES =====
app.get("/messages/:channelId", auth, async (req, res) => {
  const { channelId } = req.params;
  try {
    const db = await connectDB();
    const [rows] = await db.execute(
      "SELECT m.*, u.username FROM messages m JOIN users u ON m.user_id = u.id WHERE channel_id = ? ORDER BY m.id ASC",
      [channelId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===== SOCKET.IO REAL-TIME CHAT =====
io.on("connection", (socket) => {
  socket.on("join_channel", (channelId) => {
    socket.join(channelId);
  });

  socket.on("send_message", async (data) => {
    const { channel_id, user, message } = data;
    const db = await connectDB();
    await db.execute("INSERT INTO messages (channel_id, user_id, message) VALUES (?, ?, ?)", [channel_id, user.id, message]);

    io.to(channel_id).emit("receive_message", { channel_id, message, user });
  });
});

// ===== OPTIONAL: TEST ROUTE =====
app.get("/", (req, res) => {
  res.send("Backend is live! Socket.io running.");
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
