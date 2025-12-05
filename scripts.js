let socket = null;
let currentChannel = null;
let lastMessageTime = null;
let loadingMessages = false;

// DOM Elements
const signupContainer = document.getElementById("signup-container");
const loginContainer = document.getElementById("login-container");
const chatContainer = document.getElementById("chat-container");

const signupBtn = document.getElementById("signup-btn");
const loginBtn = document.getElementById("login-btn");
const sendBtn = document.getElementById("send-btn");
const logoutBtn = document.getElementById("logout-btn");
const leaveBtn = document.getElementById("leave-btn");

const chatBox = document.getElementById("chat-box");
const messageInput = document.getElementById("message-input");

const channelList = document.getElementById("channel-list");
const newChannelName = document.getElementById("newChannelName");
const createChannelBtn = document.getElementById("createChannelBtn");
const currentChannelName = document.getElementById("currentChannelName");
const memberInfo = document.getElementById("member-info");
const onlineInfo = document.getElementById("online-info");

// ===== Switch Forms =====
document.getElementById("goto-login").onclick = () => {
  signupContainer.style.display = "none";
  loginContainer.style.display = "block";
};
document.getElementById("goto-signup").onclick = () => {
  loginContainer.style.display = "none";
  signupContainer.style.display = "block";
};

// ===== Signup =====
signupBtn.onclick = async () => {
  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  if (!name || !email || !password) return alert("All fields required");

  const res = await fetch("http://localhost:5000/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  alert(data.message);
  if (res.ok) {
    signupContainer.style.display = "none";
    loginContainer.style.display = "block";
  }
};

// ===== Login =====
loginBtn.onclick = async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  if (!email || !password) return alert("Email & password required");

  const res = await fetch("http://localhost:5000/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.token) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    initSocket(data.user.id);
    loadChat();
  } else alert(data.message);
};

// ===== Auto Login =====
window.onload = () => {
  const user = JSON.parse(localStorage.getItem("user"));
  if (user && localStorage.getItem("token")) {
    initSocket(user.id);
    loadChat();
  }
};

// ===== Initialize Socket =====
function initSocket(userId) {
  if (socket) socket.disconnect();
  socket = io("http://localhost:5000", { query: { user_id: userId } });

  socket.on("receive_message", data => {
    if (data.channel_id === currentChannel) appendMessage(data.message, data.user);
  });

  socket.on("online_users", users => {
    if (onlineInfo) onlineInfo.textContent = `Online Users: ${users.length}`;
  });
}

// ===== Load Chat =====
function loadChat() {
  signupContainer.style.display = "none";
  loginContainer.style.display = "none";
  chatContainer.style.display = "block";
  loadChannels();
}

// ===== Load Channels =====
async function loadChannels() {
  const res = await fetch("http://localhost:5000/channels", {
    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
  });
  const channels = await res.json();
  channelList.innerHTML = "";
  channels.forEach(ch => {
    const div = document.createElement("div");
    div.textContent = ch.name;
    div.className = "channel-item";
    div.onclick = () => selectChannel(ch.id, ch.name);
    channelList.appendChild(div);
  });
}

// ===== Create Channel =====
createChannelBtn.onclick = async () => {
  const name = newChannelName.value.trim();
  if (!name) return alert("Enter channel name");
  const res = await fetch("http://localhost:5000/channels", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name })
  });
  const data = await res.json();
  if (res.ok) {
    newChannelName.value = "";
    loadChannels();
  } else alert(data.message);
};

// ===== Select / Join Channel =====
async function selectChannel(id, name) {
  await fetch("http://localhost:5000/channels/join", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ channel_id: id })
  });

  currentChannel = id;
  lastMessageTime = null;

  currentChannelName.textContent = name;
  leaveBtn.style.display = "inline-block";
  chatBox.innerHTML = "";

  loadMessages(id);
  loadChannelMembers(id);
  socket.emit("join_channel", id);
}

// ===== Leave Channel =====
leaveBtn.onclick = async () => {
  if (!currentChannel) return alert("No channel selected");
  await fetch("http://localhost:5000/channels/leave", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ channel_id: currentChannel })
  });
  alert("Left channel");
  currentChannel = null;
  chatBox.innerHTML = "";
  currentChannelName.textContent = "Select a channel";
  memberInfo.textContent = "Members: 0";
  leaveBtn.style.display = "none";
};

// ===== Load Messages with Pagination =====
async function loadMessages(channelId) {
  if (loadingMessages) return;
  loadingMessages = true;

  const url = lastMessageTime
    ? `http://localhost:5000/messages/${channelId}?before=${lastMessageTime}`
    : `http://localhost:5000/messages/${channelId}`;

  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
  });

  const messages = await res.json();
  if (!messages.length) {
    loadingMessages = false;
    return;
  }

  lastMessageTime = messages[messages.length - 1].timestamp;

  messages.reverse().forEach(msg => {
    prependMessage(msg.message, { username: msg.username });
  });

  loadingMessages = false;
}

// ===== Prepend Message =====
function prependMessage(message, user) {
  const div = document.createElement("div");
  div.innerHTML = `<strong>${user.username}:</strong> ${message}`;
  chatBox.insertBefore(div, chatBox.firstChild);
}

// ===== Scroll Event for Pagination =====
chatBox.addEventListener("scroll", () => {
  if (chatBox.scrollTop === 0 && currentChannel) {
    loadMessages(currentChannel);
  }
});

// ===== Load Members =====
async function loadChannelMembers(channelId) {
  const res = await fetch(`http://localhost:5000/channels/${channelId}/members`, {
    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await res.json();
  memberInfo.textContent = `Members: ${data.count}`;
}

// ===== Send Message =====
sendBtn.onclick = () => {
  const message = messageInput.value.trim();
  if (!currentChannel || !message) return;
  const user = JSON.parse(localStorage.getItem("user"));
  socket.emit("send_message", { message, user, channel_id: currentChannel });
  messageInput.value = "";
};

// ===== Append Message =====
function appendMessage(message, user) {
  const div = document.createElement("div");
  div.innerHTML = `<strong>${user.username}:</strong> ${message}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ===== Logout =====
logoutBtn.onclick = () => {
  if (socket) socket.disconnect();
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  chatContainer.style.display = "none";
  loginContainer.style.display = "block";
  currentChannel = null;
  leaveBtn.style.display = "none";
  memberInfo.textContent = "Members: 0";
  if (onlineInfo) onlineInfo.textContent = "Online Users: 0";
};
