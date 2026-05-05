/**
 * GTD Flow — Frontend application logic.
 *
 * Vanilla JS single-page app that talks to the Flask API.
 * Handles task list navigation, CRUD, and agent chat.
 */

const API = "";  // Same origin

const app = {
  currentList: "inbox",
  currentProject: null,
  currentArea: null,
  selectedItemId: null,
  allTasks: [],
  parents: [],
  areas: [],
  chatSending: false,
};

// ── Initialization ───────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupNewTask();
  setupDetail();
  setupChat();
  setupVoice();
  loadSummary();
  loadItems("inbox");
  loadParents();
  loadAreas();
});

// ── Navigation ───────────────────────────────────────────────────────

function setupNavigation() {
  document.querySelectorAll(".nav-item[data-list]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      app.currentProject = null;
      app.currentArea = null;
      setActiveNav(el);
      loadItems(el.dataset.list);
    });
  });
}

function setActiveNav(el) {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  el.classList.add("active");
  app.currentList = el.dataset.list || null;

  const title = el.querySelector(".nav-label")?.textContent || "Items";
  document.getElementById("list-title").textContent = title;

  // Hide detail, show list
  document.getElementById("task-detail").style.display = "none";
  document.getElementById("task-list").style.display = "";
  app.selectedItemId = null;
}

// ── Load Items ───────────────────────────────────────────────────────

async function loadItems(list) {
  let url = `${API}/api/items`;
  const params = new URLSearchParams();

  // Logbook and trash load from archive
  if (list === "logbook") {
    const res = await fetch(`${API}/api/archive/completed?limit=100`);
    const items = await res.json();
    app.allTasks = items;
    renderItems(items);
    return;
  }
  if (list === "trash") {
    const res = await fetch(`${API}/api/archive/trashed?limit=100`);
    const items = await res.json();
    app.allTasks = items;
    renderItems(items);
    return;
  }

  if (app.currentProject) {
    params.set("parent", app.currentProject);
  } else if (app.currentArea) {
    params.set("area", app.currentArea);
  } else if (list) {
    params.set("list", list);
  }

  if (params.toString()) url += "?" + params.toString();

  const res = await fetch(url);
  const items = await res.json();

  // Also load all active tasks for parent/child lookups
  const allRes = await fetch(`${API}/api/items`);
  app.allTasks = await allRes.json();

  renderItems(items);
}

function renderItems(items) {
  const container = document.getElementById("task-list");
  const empty = document.getElementById("empty-state");

  // Remove old items (keep empty-state)
  container.querySelectorAll(".task-item").forEach(el => el.remove());

  if (items.length === 0) {
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";

  items.forEach(item => {
    if (item.type === "area") return;  // Don't show areas as task items
    const el = createTaskElement(item);
    container.appendChild(el);
  });
}

function createTaskElement(item) {
  const div = document.createElement("div");
  div.className = "task-item" + (item.list === "logbook" ? " completed" : "");
  div.dataset.id = item.id;

  const isProject = item.type === "project";

  // Checkbox (not for projects)
  const checkbox = document.createElement("div");
  checkbox.className = "task-checkbox" + (item.list === "logbook" ? " checked" : "");
  if (!isProject) {
    checkbox.addEventListener("click", async e => {
      e.stopPropagation();
      const newList = item.list === "logbook" ? "anytime" : "logbook";
      await fetch(`${API}/api/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: newList }),
      });
      refreshView();
    });
  }

  // Body
  const body = document.createElement("div");
  body.className = "task-body";

  const title = document.createElement("div");
  title.className = "task-title";
  title.textContent = (isProject ? "📁 " : "") + item.title;

  body.appendChild(title);

  // Meta (tags, project, deadline)
  const meta = document.createElement("div");
  meta.className = "task-meta";

  (item.tags || []).forEach(tag => {
    const span = document.createElement("span");
    span.className = "task-tag" + (tag.startsWith("context:") ? " context" : "");
    span.textContent = tag;
    meta.appendChild(span);
  });

  if (item.project) {
    const span = document.createElement("span");
    span.className = "task-project-label";
    span.textContent = "📁 " + item.project;
    meta.appendChild(span);
  }

  // Show subtask count if this task has children
  const children = app.allTasks.filter(t => t.parent === item.id);
  if (children.length > 0) {
    const span = document.createElement("span");
    span.className = "task-date";
    span.textContent = `${children.length} subtask${children.length > 1 ? "s" : ""}`;
    meta.appendChild(span);
  }

  // Show parent name
  if (item.parent) {
    const parentTask = app.allTasks.find(t => t.id === item.parent);
    if (parentTask) {
      const span = document.createElement("span");
      span.className = "task-project-label";
      span.textContent = "↑ " + parentTask.title;
      meta.appendChild(span);
    }
  }

  if (item.deadline) {
    const span = document.createElement("span");
    span.className = "task-deadline";
    span.textContent = "⏰ " + item.deadline;
    meta.appendChild(span);
  }

  if (item.when_date) {
    const span = document.createElement("span");
    span.className = "task-date";
    span.textContent = "📅 " + item.when_date;
    meta.appendChild(span);
  }

  if (isProject && item.task_count !== undefined) {
    const span = document.createElement("span");
    span.className = "task-date";
    span.textContent = `${item.completed_count || 0}/${item.task_count} tasks`;
    meta.appendChild(span);
  }

  if (meta.children.length > 0) body.appendChild(meta);

  div.appendChild(checkbox);
  div.appendChild(body);

  // Click to open detail
  div.addEventListener("click", () => openDetail(item.id));

  return div;
}

// ── New Task ─────────────────────────────────────────────────────────

function setupNewTask() {
  const btn = document.getElementById("btn-add");
  const form = document.getElementById("new-task-form");
  const input = document.getElementById("new-task-input");
  const notes = document.getElementById("new-task-notes");
  const save = document.getElementById("btn-save-task");
  const cancel = document.getElementById("btn-cancel-task");

  btn.addEventListener("click", () => {
    form.style.display = form.style.display === "none" ? "" : "none";
    if (form.style.display !== "none") input.focus();
  });

  const doSave = async () => {
    const title = input.value.trim();
    if (!title) return;

    const data = { title, notes: notes.value.trim() };

    // If we're viewing a specific list, create task directly in that list
    if (app.currentList && app.currentList !== "inbox" && app.currentList !== "logbook" && app.currentList !== "trash") {
      data.list = app.currentList === "today" ? "today" : app.currentList;
    }

    if (app.currentProject) {
      data.parent = app.currentProject;
      if (!data.list) data.list = "anytime";
    }

    await fetch(`${API}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    input.value = "";
    notes.value = "";
    form.style.display = "none";
    refreshView();
  };

  save.addEventListener("click", doSave);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSave(); }
    if (e.key === "Escape") { form.style.display = "none"; }
  });
  cancel.addEventListener("click", () => {
    input.value = "";
    notes.value = "";
    form.style.display = "none";
  });
}

// ── Task Detail ──────────────────────────────────────────────────────

function setupDetail() {
  document.getElementById("btn-back").addEventListener("click", closeDetail);
  document.getElementById("btn-detail-save").addEventListener("click", saveDetail);
  document.getElementById("btn-detail-delete").addEventListener("click", deleteDetail);

  document.getElementById("checklist-new").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const input = e.target;
      const title = input.value.trim();
      if (!title) return;
      addChecklistItem(title, false);
      input.value = "";
    }
  });
}

async function openDetail(itemId) {
  const res = await fetch(`${API}/api/items/${itemId}`);
  if (!res.ok) return;
  const item = await res.json();
  app.selectedItemId = itemId;

  document.getElementById("task-list").style.display = "none";
  document.getElementById("new-task-form").style.display = "none";
  const detail = document.getElementById("task-detail");
  detail.style.display = "";

  document.getElementById("detail-title").value = item.title;
  document.getElementById("detail-notes").value = item.notes || "";
  document.getElementById("detail-list").value = item.list || "inbox";
  document.getElementById("detail-when-date").value = item.when_date || "";
  document.getElementById("detail-deadline").value = item.deadline || "";
  document.getElementById("detail-tags").value = (item.tags || []).join(", ");

  // Populate project/area dropdowns
  // Populate parent task dropdown (exclude self and own children)
  const parentSelect = document.getElementById("detail-parent");
  parentSelect.innerHTML = '<option value="">None (top-level)</option>';
  app.allTasks.forEach(t => {
    if (t.id === item.id) return;  // can't be own parent
    if (t.parent === item.id) return;  // can't pick own child
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.title;
    if (t.id === item.parent) opt.selected = true;
    parentSelect.appendChild(opt);
  });

  const areaSelect = document.getElementById("detail-area");
  areaSelect.innerHTML = '<option value="">None</option>';
  app.areas.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.title;
    opt.textContent = a.title;
    if (a.title === item.area) opt.selected = true;
    areaSelect.appendChild(opt);
  });

  // Render checklist
  const clContainer = document.getElementById("checklist-items");
  clContainer.innerHTML = "";
  (item.checklist || []).forEach((step, i) => addChecklistItem(step.title, step.done));
}

function addChecklistItem(title, completed) {
  const container = document.getElementById("checklist-items");
  const div = document.createElement("div");
  div.className = "checklist-item";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = completed;

  const span = document.createElement("span");
  span.className = completed ? "completed-step" : "";
  span.textContent = title;

  cb.addEventListener("change", () => {
    span.className = cb.checked ? "completed-step" : "";
  });

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "×";
  removeBtn.style.cssText = "background:none;border:none;color:#999;cursor:pointer;font-size:16px;margin-left:auto;";
  removeBtn.addEventListener("click", () => div.remove());

  div.appendChild(cb);
  div.appendChild(span);
  div.appendChild(removeBtn);
  container.appendChild(div);
}

async function saveDetail() {
  if (!app.selectedItemId) return;

  const tags = document.getElementById("detail-tags").value
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  const checklist = [];
  document.querySelectorAll("#checklist-items .checklist-item").forEach(el => {
    checklist.push({
      title: el.querySelector("span").textContent,
      done: el.querySelector("input").checked,
    });
  });

  const data = {
    title: document.getElementById("detail-title").value.trim(),
    notes: document.getElementById("detail-notes").value.trim(),
    list: document.getElementById("detail-list").value,
    when_date: document.getElementById("detail-when-date").value || null,
    deadline: document.getElementById("detail-deadline").value || null,
    tags,
    parent: document.getElementById("detail-parent").value || null,
    area: document.getElementById("detail-area").value || null,
    checklist,
  };

  await fetch(`${API}/api/items/${app.selectedItemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  closeDetail();
  refreshView();
}

async function deleteDetail() {
  if (!app.selectedItemId) return;
  await fetch(`${API}/api/items/${app.selectedItemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ list: "trash" }),
  });
  closeDetail();
  refreshView();
}

function closeDetail() {
  document.getElementById("task-detail").style.display = "none";
  document.getElementById("task-list").style.display = "";
  app.selectedItemId = null;
}

// ── Chat ─────────────────────────────────────────────────────────────

function setupChat() {
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("btn-send");
  const clearBtn = document.getElementById("btn-clear-chat");

  const doSend = () => {
    const msg = input.value.trim();
    if (!msg || app.chatSending) return;
    input.value = "";
    input.style.height = "auto";
    sendChat(msg);
  };

  sendBtn.addEventListener("click", doSend);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });

  // Auto-resize textarea
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  clearBtn.addEventListener("click", async () => {
    await fetch(`${API}/api/agent/history`, { method: "DELETE" });
    const container = document.getElementById("chat-messages");
    container.innerHTML = "";
    addChatMessage("assistant", "Fresh start! What's on your mind? 🧠");
  });
}

async function sendChat(message) {
  app.chatSending = true;
  document.getElementById("btn-send").disabled = true;

  addChatMessage("user", message);
  const typingEl = addTypingIndicator();

  try {
    const res = await fetch(`${API}/api/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    // Read the SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();  // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = JSON.parse(line.slice(6));

        if (data.type === "action") {
          addChatAction(data.tool, data.args);
        } else if (data.type === "response") {
          typingEl.remove();
          addChatMessage("assistant", data.content);
        } else if (data.type === "done") {
          refreshView();
        }
      }
    }
  } catch (err) {
    typingEl.remove();
    addChatMessage("assistant", "Sorry, something went wrong. Please try again.");
    console.error("Chat error:", err);
  }

  app.chatSending = false;
  document.getElementById("btn-send").disabled = false;
}

function addChatMessage(role, text) {
  const container = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = `chat-message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;

  div.appendChild(bubble);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addChatAction(tool, args) {
  const container = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "chat-message assistant";

  const action = document.createElement("div");
  action.className = "chat-action";

  const labels = {
    capture: `📥 Added to inbox: "${args.title}"`,
    add_tasks: `📥 Added ${args.tasks?.length || 0} tasks`,
    create_task: `✅ Created task: "${args.title}"`,
    complete_task: `✓ Completed task`,
    delete_task: `🗑️ Deleted task`,
    update_task: `✏️ Updated task`,
    create_project: `📁 Created project: "${args.title}"`,
    create_area: `🏷️ Created area: "${args.title}"`,
    get_items: `📋 Checking ${args.list || "items"}...`,
    get_item: `🔍 Looking up item...`,
    get_projects: `📁 Checking projects...`,
    get_areas: `🏷️ Checking areas...`,
    search: `🔍 Searching: "${args.query}"`,
  };

  action.textContent = labels[tool] || `🔧 ${tool}`;
  div.appendChild(action);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addTypingIndicator() {
  const container = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "chat-message assistant";

  const typing = document.createElement("div");
  typing.className = "chat-typing";
  typing.innerHTML = "<span></span><span></span><span></span>";

  div.appendChild(typing);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

// ── Voice Chat (OpenAI Realtime API via WebRTC) ──────────────────────

let peerConnection = null;
let dataChannel = null;
let voiceStream = null;
let isVoiceActive = false;

function setupVoice() {
  const micBtn = document.getElementById("btn-mic");
  micBtn.addEventListener("click", () => {
    if (isVoiceActive) {
      stopVoice();
    } else {
      startVoice();
    }
  });
}

async function startVoice() {
  const micBtn = document.getElementById("btn-mic");
  const status = document.getElementById("voice-status");
  const statusText = document.getElementById("voice-status-text");

  try {
    micBtn.disabled = true;
    statusText.textContent = "Connecting...";
    status.style.display = "flex";

    // 1. Get ephemeral token from our server
    const tokenRes = await fetch(`${API}/api/realtime/session`, { method: "POST" });
    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      throw new Error(tokenData.error);
    }
    const ephemeralKey = tokenData.client_secret.value;

    // 2. Create WebRTC peer connection
    peerConnection = new RTCPeerConnection();

    // 3. Play agent's audio through speakers
    const audioEl = document.getElementById("voice-audio");
    peerConnection.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
    };

    // 4. Capture microphone and add track
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceStream.getTracks().forEach(track => peerConnection.addTrack(track, voiceStream));

    // 5. Set up data channel for events (tool calls, transcripts)
    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.onopen = () => {
      statusText.textContent = "Voice active — start talking!";
    };
    dataChannel.onmessage = handleVoiceEvent;

    // 6. Create SDP offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // 7. Send offer to OpenAI, get SDP answer
    const model = tokenData.model || "gpt-4o-mini-realtime-preview";
    const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    });

    if (!sdpRes.ok) throw new Error(`WebRTC handshake failed: ${sdpRes.status}`);

    const answerSdp = await sdpRes.text();
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });

    // Connected!
    isVoiceActive = true;
    micBtn.classList.add("active");
    micBtn.disabled = false;

  } catch (err) {
    console.error("Voice chat error:", err);
    addChatMessage("assistant", `Voice connection failed: ${err.message}`);
    stopVoice();
  }
}

function stopVoice() {
  const micBtn = document.getElementById("btn-mic");
  const status = document.getElementById("voice-status");

  if (voiceStream) {
    voiceStream.getTracks().forEach(t => t.stop());
    voiceStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  dataChannel = null;
  isVoiceActive = false;

  micBtn.classList.remove("active");
  micBtn.disabled = false;
  status.style.display = "none";
}

// Accumulate partial transcript for the current agent response
let agentTranscript = "";

function handleVoiceEvent(event) {
  const data = JSON.parse(event.data);

  switch (data.type) {
    // User's speech was transcribed
    case "conversation.item.input_audio_transcription.completed":
      if (data.transcript && data.transcript.trim()) {
        addChatMessage("user", data.transcript.trim());
      }
      break;

    // Agent is generating a text transcript of its voice response
    case "response.audio_transcript.delta":
      agentTranscript += data.delta || "";
      break;

    // Agent finished its voice response — show full transcript in chat
    case "response.audio_transcript.done":
      if (data.transcript && data.transcript.trim()) {
        addChatMessage("assistant", data.transcript.trim());
      }
      agentTranscript = "";
      break;

    // Agent wants to call a tool
    case "response.function_call_arguments.done":
      executeVoiceTool(data);
      break;

    // Full response finished (might contain tool calls + text)
    case "response.done":
      refreshView();
      break;

    // Errors
    case "error":
      console.error("Realtime API error:", data.error);
      addChatMessage("assistant", `Error: ${data.error?.message || "Unknown error"}`);
      break;
  }
}

async function executeVoiceTool(data) {
  const { call_id, name, arguments: argsStr } = data;
  let args = {};
  try { args = JSON.parse(argsStr); } catch {}

  // Show action in chat
  addChatAction(name, args);

  // Execute via our server
  try {
    const res = await fetch(`${API}/api/tools/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
    });
    const result = await res.json();

    // Send result back to OpenAI via data channel
    if (dataChannel && dataChannel.readyState === "open") {
      dataChannel.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call_id,
          output: JSON.stringify(result),
        },
      }));

      // Trigger the agent to respond with the tool result
      dataChannel.send(JSON.stringify({ type: "response.create" }));
    }
  } catch (err) {
    console.error("Tool execution error:", err);
  }

  refreshView();
}

// ── Data Loading ─────────────────────────────────────────────────────

async function loadSummary() {
  const res = await fetch(`${API}/api/summary`);
  const summary = await res.json();

  for (const [list, count] of Object.entries(summary)) {
    const el = document.getElementById(`count-${list}`);
    if (el) {
      el.textContent = count > 0 ? count : "";
      el.dataset.count = count;
    }
  }
}

async function loadParents() {
  const res = await fetch(`${API}/api/parents`);
  app.parents = await res.json();

  const container = document.getElementById("parent-list");
  container.innerHTML = "";

  app.parents.forEach(parent => {
    const a = document.createElement("a");
    a.href = "#";
    a.className = "nav-item";
    a.innerHTML = `
      <span class="nav-icon">📁</span>
      <span class="nav-label">${escapeHtml(parent.title)}</span>
      <span class="nav-count">${parent.task_count || ""}</span>
    `;
    a.addEventListener("click", e => {
      e.preventDefault();
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      a.classList.add("active");
      app.currentList = null;
      app.currentProject = parent.id;
      app.currentArea = null;
      document.getElementById("list-title").textContent = parent.title;
      document.getElementById("task-detail").style.display = "none";
      document.getElementById("task-list").style.display = "";
      loadItems();
    });
    container.appendChild(a);
  });
}

async function loadAreas() {
  const res = await fetch(`${API}/api/areas`);
  app.areas = await res.json();

  const container = document.getElementById("area-list");
  container.innerHTML = "";

  app.areas.forEach(area => {
    const a = document.createElement("a");
    a.href = "#";
    a.className = "nav-item";
    a.dataset.areaId = area.id;
    a.innerHTML = `
      <span class="nav-icon">🏷️</span>
      <span class="nav-label">${escapeHtml(area.title)}</span>
    `;
    a.addEventListener("click", e => {
      e.preventDefault();
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      a.classList.add("active");
      app.currentList = null;
      app.currentProject = null;
      app.currentArea = area.title;
      document.getElementById("list-title").textContent = area.title;
      document.getElementById("task-detail").style.display = "none";
      document.getElementById("task-list").style.display = "";
      loadItems();
    });
    container.appendChild(a);
  });
}

function refreshView() {
  loadSummary();
  loadParents();
  loadAreas();
  if (app.currentList) {
    loadItems(app.currentList);
  } else {
    loadItems();
  }
}

// ── Utilities ────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
