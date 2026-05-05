"""
GTD Flow — Flask server with REST API and agent chat endpoint.

Serves the static frontend and provides API endpoints for task management
and conversational AI interaction.
"""

import json
import os
import urllib.request
import urllib.error
from flask import Flask, request, jsonify, Response, send_from_directory
from dotenv import load_dotenv

load_dotenv()

from store import Store
from agent import Agent, TOOLS, SYSTEM_PROMPT

app = Flask(__name__, static_folder="static")
store = Store()
agent = Agent(store)


# ── Static Files ──────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/static/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)


# ── Items API ─────────────────────────────────────────────────────────

@app.route("/api/items", methods=["GET"])
def list_items():
    items = store.query_tasks(
        list_name=request.args.get("list"),
        parent=request.args.get("parent"),
        area=request.args.get("area"),
        tag=request.args.get("tag"),
        search=request.args.get("search"),
    )
    return jsonify(items)


@app.route("/api/items/<item_id>", methods=["GET"])
def get_item(item_id):
    item = store.get_task(item_id)
    if not item:
        return jsonify({"error": "Not found"}), 404
    return jsonify(item)


@app.route("/api/items", methods=["POST"])
def create_item():
    data = request.json or {}
    title = data.pop("title", "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400
    item = store.add_task(title, **data)
    return jsonify(item), 201


@app.route("/api/items/<item_id>", methods=["PUT"])
def update_item(item_id):
    data = request.json or {}
    item = store.update_task(item_id, **data)
    if not item:
        return jsonify({"error": "Not found"}), 404
    return jsonify(item)


@app.route("/api/items/<item_id>", methods=["DELETE"])
def delete_item(item_id):
    if store.delete_task(item_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Not found"}), 404


# ── Projects & Areas ─────────────────────────────────────────────────

@app.route("/api/parents", methods=["GET"])
def list_parents():
    """Tasks that have children (replaces old projects endpoint)."""
    parents = store.get_parent_tasks()
    for p in parents:
        children = store.get_children(p["id"])
        p["task_count"] = len(children)
        p["completed_count"] = 0  # children are archived on completion
    return jsonify(parents)


@app.route("/api/areas", methods=["GET"])
def list_areas():
    return jsonify(store.get_areas())


@app.route("/api/tags", methods=["GET"])
def list_tags():
    return jsonify(store.get_tags())


@app.route("/api/summary", methods=["GET"])
def summary():
    return jsonify(store.get_summary())


@app.route("/api/archive/<which>", methods=["GET"])
def get_archive(which):
    """Get archived items (completed or trashed). ?limit=50"""
    limit = int(request.args.get("limit", 50))
    return jsonify(store.get_archived(which, limit))


# ── Agent Chat ────────────────────────────────────────────────────────

@app.route("/api/agent/chat", methods=["POST"])
def agent_chat():
    """
    Send a message to the GTD agent. Returns a streaming SSE response
    with action events (tool calls) and the final text response.

    Events:
      data: {"type": "action", "tool": "...", "args": {...}, "result": {...}}
      data: {"type": "response", "content": "..."}
      data: {"type": "done"}
    """
    data = request.json or {}
    message = data.get("message", "").strip()
    if not message:
        return jsonify({"error": "Message is required"}), 400

    def generate():
        result = agent.chat(message)

        # Send each tool action as a separate event
        for action in result["actions"]:
            yield f"data: {json.dumps({'type': 'action', 'tool': action['tool'], 'args': action['args']})}\n\n"

        # Send the text response
        yield f"data: {json.dumps({'type': 'response', 'content': result['response']})}\n\n"

        # Signal completion
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return Response(generate(), mimetype="text/event-stream")


# ── Realtime Voice API ────────────────────────────────────────────────

@app.route("/api/realtime/session", methods=["POST"])
def create_realtime_session():
    """
    Create an ephemeral token for the OpenAI Realtime API.
    The browser uses this token to establish a direct WebRTC connection
    to OpenAI for voice interaction.
    """
    # Convert Chat Completions tool format → Realtime API format
    realtime_tools = []
    for tool in TOOLS:
        fn = tool["function"]
        realtime_tools.append({
            "type": "function",
            "name": fn["name"],
            "description": fn["description"],
            "parameters": fn["parameters"],
        })

    realtime_model = os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-mini-realtime-preview")

    body = json.dumps({
        "model": realtime_model,
        "voice": "ash",
        "instructions": SYSTEM_PROMPT,
        "tools": realtime_tools,
        "input_audio_transcription": {"model": "whisper-1"},
    }).encode()

    req = urllib.request.Request(
        "https://api.openai.com/v1/realtime/sessions",
        data=body,
        headers={
            "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            return jsonify(json.loads(resp.read()))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        return jsonify({"error": error_body}), e.code


@app.route("/api/tools/execute", methods=["POST"])
def execute_tool():
    """
    Execute a tool call from the Realtime API voice session.
    The browser receives function_call events from OpenAI via WebRTC,
    calls this endpoint to execute them, then sends results back.
    """
    data = request.json or {}
    name = data.get("name")
    arguments = data.get("arguments", {})
    if not name:
        return jsonify({"error": "Tool name is required"}), 400
    result = agent._execute_tool(name, json.dumps(arguments))
    return jsonify(result)


@app.route("/api/agent/history", methods=["DELETE"])
def clear_history():
    agent.clear_history()
    return jsonify({"ok": True})


# ── Main ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    print(f"GTD Flow running at http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
