"""
GTD Flow — AI Agent with full-state awareness.

The agent sees the entire active GTD state and has simple tools to
mutate it. Tasks are hierarchical — any task can be a parent of subtasks,
replacing the old "projects" concept.
"""

import json
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

SYSTEM_PROMPT = """\
You are the GTD (Getting Things Done) coach for a web app called "GTD Flow".
You help the user capture, clarify, organize, reflect on, and engage with
their tasks using David Allen's GTD methodology.

## Your Personality
- Calm, supportive, and encouraging.
- Concise — brief, helpful responses. No walls of text.
- Ask clarifying questions when processing inbox items.
- Celebrate completed tasks.

## How You Present Information
- NEVER show internal IDs, timestamps, JSON, or technical details.
- Refer to tasks by their title only, in natural language.
- When listing tasks, use a simple numbered or bulleted list of titles.
- Keep it conversational — you're a coach, not a database.

## The User Interface

The user is looking at a web app with three panels:

### Left Sidebar
Lists (each showing a count badge):
- 📥 **Inbox** — Unprocessed items. The capture bucket.
- ⭐ **Today** — Tasks committed to doing today.
- 📅 **Upcoming** — Tasks with a future scheduled date (when_date).
- 📋 **Anytime** — Available next actions, no specific date.
- ⏳ **Waiting For** — Delegated or blocked, waiting on someone/something.
- 💭 **Someday** — Ideas for the future, not active now.
- 📗 **Logbook** — Completed tasks (archived separately).
- 🗑️ **Trash** — Deleted tasks (archived separately).

Below the lists:
- **Parent Tasks** — Tasks that have subtasks (like projects). Clicking
  shows the subtasks.
- **Areas** — Areas of responsibility (Health, Work, Home, etc.).

### Center Panel — Task List
Shows tasks in the selected list. Each task has a checkbox, title, tags,
deadline, and if it has subtasks, a count. Clicking opens a detail editor
where ALL properties can be edited: title, notes, tags, list, deadline,
scheduled date, parent, area, and checklist.

### Right Panel — Chat (You)
Text and voice interface. The user talks to you here.

## Data Model

All active tasks are in one JSON file. Completed/trashed tasks are
archived separately (the AI doesn't see them unless asked).

### Task Hierarchy
Any task can be a parent of other tasks. This replaces "projects":
- A task with children is essentially a project.
- When a parent task has all children completed, you should suggest
  completing the parent too.
- Subtasks have a `parent` field set to the parent task's ID.
- Tasks without a parent are top-level.

### Task Fields
- `id` — unique identifier (internal, never show to user)
- `title` — the task description
- `list` — which sidebar list: inbox, today, upcoming, anytime, waiting, someday
- `notes` — additional details
- `tags` — array of strings; contexts use "context:" prefix
- `parent` — ID of parent task, or null
- `area` — area title string, or null
- `deadline` — "YYYY-MM-DD" or null
- `when_date` — "YYYY-MM-DD" or null (for upcoming)
- `checklist` — [{title, done}] for quick sub-steps

### Areas
Areas of responsibility: ongoing commitments like Health, Work, Home.
No end date — they represent life categories.

## GTD Methodology

### The Five Stages
1. **Capture**: Everything → Inbox. No filtering, just capture.
2. **Clarify**: Process inbox items one by one:
   - Not actionable? → Trash or Someday.
   - Takes < 2 minutes? → Suggest doing it now, then complete it.
   - Waiting on someone? → Waiting For.
   - Has a specific future date? → Upcoming (set when_date).
   - Can do anytime? → Anytime.
   - Must do today? → Today.
   - Part of a bigger effort? → Create as subtask of a parent.
3. **Organize**: Group with parent tasks, assign areas, add context tags.
4. **Reflect**: Daily/weekly reviews.
5. **Engage**: Filter by context, time, energy, priority.

### Waiting For
Items waiting on someone/something else. Check during weekly reviews.

## Key Behaviors
- User says "I need to..." → add_task to inbox.
- User rattles off multiple items → use add_tasks to batch-add them all.
- User asks about tasks → call get_state FIRST, then answer.
- User says "move X to waiting" → move_task with to_list="waiting".
- User says "make X a subtask of Y" → update_task to set parent.
- User completes something → complete_task (archives it + children).

**IMPORTANT**: Always call get_state before answering questions about
the system. Never guess — check first.

**PARALLEL TOOL CALLS**: You CAN and SHOULD make multiple tool calls in
a single turn. If the user gives you 5 tasks, call add_tasks for all of
them at once. After tool calls, always confirm what you did.
"""

# ── Tool Definitions ──────────────────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_state",
            "description": (
                "Get the COMPLETE active GTD state: all tasks and areas. "
                "Archived (completed/trashed) tasks are NOT included — "
                "they are stored separately. Call this before answering "
                "questions about what's in the system."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_task",
            "description": "Add a single new task. Goes to inbox by default.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Task title"},
                    "list": {
                        "type": "string",
                        "enum": ["inbox", "today", "upcoming", "anytime", "waiting", "someday"],
                    },
                    "notes": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "parent": {"type": "string", "description": "Parent task ID (makes this a subtask)"},
                    "area": {"type": "string", "description": "Area title"},
                    "deadline": {"type": "string", "description": "YYYY-MM-DD"},
                    "when_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "checklist": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "done": {"type": "boolean"},
                            },
                        },
                    },
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_tasks",
            "description": "Add multiple tasks at once. Use when the user gives a list of things.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tasks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "list": {"type": "string", "enum": ["inbox", "today", "upcoming", "anytime", "waiting", "someday"]},
                                "notes": {"type": "string"},
                                "tags": {"type": "array", "items": {"type": "string"}},
                                "parent": {"type": "string"},
                                "area": {"type": "string"},
                                "deadline": {"type": "string"},
                            },
                            "required": ["title"],
                        },
                    },
                },
                "required": ["tasks"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_task",
            "description": "Move a task to a different list (inbox, today, anytime, waiting, someday, etc.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "to_list": {
                        "type": "string",
                        "enum": ["inbox", "today", "upcoming", "anytime", "waiting", "someday"],
                    },
                },
                "required": ["id", "to_list"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "Update task properties. Use move_task to change lists.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "notes": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "parent": {"type": "string", "description": "Parent task ID or null"},
                    "area": {"type": "string"},
                    "deadline": {"type": "string"},
                    "when_date": {"type": "string"},
                    "checklist": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "done": {"type": "boolean"},
                            },
                        },
                    },
                },
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "complete_task",
            "description": "Mark a task as done. Archives it and all its subtasks to the Logbook.",
            "parameters": {
                "type": "object",
                "properties": {"id": {"type": "string"}},
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "Delete a task. Archives it and all its subtasks to Trash.",
            "parameters": {
                "type": "object",
                "properties": {"id": {"type": "string"}},
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_area",
            "description": "Create an area of responsibility (e.g., Health, Work, Home).",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["title"],
            },
        },
    },
]


class Agent:
    """OpenAI-powered GTD coach."""

    def __init__(self, store):
        self.store = store
        self.client = OpenAI()
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")
        self.messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    def clear_history(self):
        self.messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    def chat(self, user_message):
        self.messages.append({"role": "user", "content": user_message})
        actions = []

        while True:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=self.messages,
                tools=TOOLS,
            )
            msg = response.choices[0].message
            self.messages.append(msg)

            if msg.tool_calls:
                for tc in msg.tool_calls:
                    result = self._execute_tool(tc.function.name, tc.function.arguments)
                    actions.append({
                        "tool": tc.function.name,
                        "args": json.loads(tc.function.arguments),
                        "result": result,
                    })
                    self.messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result),
                    })
            else:
                return {"response": msg.content or "", "actions": actions}

    def _execute_tool(self, name, arguments_json):
        args = json.loads(arguments_json)

        if name == "get_state":
            return self.store.get_state()

        elif name == "add_task":
            title = args.pop("title")
            return self.store.add_task(title, **args)

        elif name == "add_tasks":
            results = []
            for t in args.get("tasks", []):
                title = t.pop("title")
                results.append(self.store.add_task(title, **t))
            return {"added": len(results), "tasks": results}

        elif name == "move_task":
            result = self.store.update_task(args["id"], list=args["to_list"])
            return result or {"error": "Task not found"}

        elif name == "update_task":
            task_id = args.pop("id")
            result = self.store.update_task(task_id, **args)
            return result or {"error": "Task not found"}

        elif name == "complete_task":
            result = self.store.complete_task(args["id"])
            return result or {"error": "Task not found"}

        elif name == "delete_task":
            result = self.store.trash_task(args["id"])
            return result or {"error": "Task not found"}

        elif name == "create_area":
            return self.store.add_area(args["title"], notes=args.get("notes", ""))

        return {"error": f"Unknown tool: {name}"}
