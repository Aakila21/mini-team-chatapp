const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*" }
});

// ===== PostgreSQL connection =====
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "chat_app",
  port: process.env.DB_PORT || 5432
});

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
    const client = await pool.connect();
    const exists = await client.query("SELECT * FROM users WHERE email=$1", [email]);
    if (exists.rows.length > 0) {
      client.release();
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    await client.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
      [name, email, hashed]
    );
    client.release();

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
    const client = await pool.connect();
    const result = await client.query("SELECT * FROM users WHERE email=$1", [email]);
    client.release();

    if (result.rows.length === 0)
      return res.status(400).json({ message: "Invalid email or password" });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { id: user.id, name: user.username },
      process.env.JWT_SECRET || "SECRET_KEY",
      { expiresIn: "7d" }
    );

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
    const client = await pool.connect();
    await client.query("INSERT INTO channels (name) VALUES ($1)", [name]);
    client.release();
    res.json({ message: "Channel created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===== GET CHANNEL LIST =====
app.get("/channels", auth, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT * FROM channels");
    client.release();
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===== GET MESSAGES =====
app.get("/messages/:channelId", auth, async (req, res) => {
  const { channelId } = req.params;
  try {
    const client = await pool.connect();
    const result = await client.query(
      `SELECT m.*, u.username 
       FROM messages m 
       JOIN users u ON m.user_id = u.id 
       WHERE channel_id = $1 
       ORDER BY m.id ASC`,
      [channelId]
    );
    client.release();
    res.json(result.rows);
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
    try {
      const client = await pool.connect();
      await client.query(
        "INSERT INTO messages (channel_id, user_id, message) VALUES ($1, $2, $3)",
        [channel_id, user.id, message]
      );
      client.release();

      io.to(channel_id).emit("receive_message", { channel_id, message, user });
    } catch (err) {
      console.error(err);
    }
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
