"""
GTD Flow — Single-file JSON store with archive separation.

Active tasks live in data/gtd.json. Completed and trashed tasks are
moved to data/archive.json so the active file stays small forever.

Tasks are hierarchical: any task can have a parent, making it a subtask.
"Projects" are just tasks that have children — no special type needed.

Schema for gtd.json:
{
  "tasks": [
    {
      "id": "a1b2c3d4",
      "title": "Plan vacation",
      "list": "anytime",
      "notes": "Summer Europe trip",
      "tags": ["context:computer"],
      "parent": null,           // ID of parent task, or null
      "area": null,             // area title string, or null
      "deadline": null,         // "YYYY-MM-DD" or null
      "when_date": null,        // "YYYY-MM-DD" or null (for upcoming)
      "checklist": [],          // [{title, done}]
      "created": "2024-01-10T10:00:00Z"
    }
  ],
  "areas": [
    {"title": "Health", "notes": ""}
  ]
}

Schema for archive.json:
{
  "completed": [ ...tasks with "completed" timestamp... ],
  "trashed": [ ...tasks... ]
}
"""

import json
import os
import uuid
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
ACTIVE_PATH = os.path.join(DATA_DIR, "gtd.json")
ARCHIVE_PATH = os.path.join(DATA_DIR, "archive.json")

LISTS = ["inbox", "today", "upcoming", "anytime", "waiting", "someday"]


class Store:

    def __init__(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        self._migrate_old_format()
        self.data = self._load(ACTIVE_PATH, {"tasks": [], "areas": []})
        self.archive = self._load(ARCHIVE_PATH, {"completed": [], "trashed": []})

    def _load(self, path, default):
        if os.path.exists(path):
            with open(path, "r") as f:
                return json.load(f)
        return default

    def _save(self):
        with open(ACTIVE_PATH, "w") as f:
            json.dump(self.data, f, indent=2)

    def _save_archive(self):
        with open(ARCHIVE_PATH, "w") as f:
            json.dump(self.archive, f, indent=2)

    def _new_id(self):
        return uuid.uuid4().hex[:8]

    def _now(self):
        return datetime.utcnow().isoformat(timespec="seconds") + "Z"

    # ── Migration ─────────────────────────────────────────────────────

    def _migrate_old_format(self):
        """Migrate old gtd.json (with projects array) to new format."""
        if not os.path.exists(ACTIVE_PATH):
            return
        with open(ACTIVE_PATH, "r") as f:
            old = json.load(f)

        if "projects" not in old:
            return  # already new format or empty

        projects = old.pop("projects", [])
        tasks = old.get("tasks", [])

        # Convert projects to parent tasks
        for proj in projects:
            parent_id = self._new_id()
            parent_task = {
                "id": parent_id,
                "title": proj["title"],
                "list": "anytime",
                "notes": proj.get("notes", ""),
                "tags": proj.get("tags", []),
                "parent": None,
                "area": proj.get("area"),
                "deadline": proj.get("deadline"),
                "when_date": None,
                "checklist": [],
                "created": self._now(),
            }
            tasks.append(parent_task)

            # Re-parent tasks that referenced this project by title
            for task in tasks:
                if task.get("project") == proj["title"]:
                    task["parent"] = parent_id
                    task.pop("project", None)

        # Clean up: ensure all tasks have parent field, remove project field
        for task in tasks:
            task.pop("project", None)
            task.setdefault("parent", None)

        # Separate active vs archived
        active_tasks = []
        completed = []
        trashed = []
        for task in tasks:
            if task.get("list") == "logbook":
                task.setdefault("completed", self._now())
                completed.append(task)
            elif task.get("list") == "trash":
                trashed.append(task)
            else:
                active_tasks.append(task)

        old["tasks"] = active_tasks
        with open(ACTIVE_PATH, "w") as f:
            json.dump(old, f, indent=2)

        if completed or trashed:
            archive = self._load(ARCHIVE_PATH, {"completed": [], "trashed": []})
            archive["completed"].extend(completed)
            archive["trashed"].extend(trashed)
            with open(ARCHIVE_PATH, "w") as f:
                json.dump(archive, f, indent=2)

    # ── Full State ────────────────────────────────────────────────────

    def get_state(self):
        """Return the full active state for the AI and UI."""
        return self.data

    # ── Tasks ─────────────────────────────────────────────────────────

    def add_task(self, title, **kwargs):
        task = {
            "id": self._new_id(),
            "title": title,
            "list": kwargs.get("list", "inbox"),
            "notes": kwargs.get("notes", ""),
            "tags": kwargs.get("tags", []),
            "parent": kwargs.get("parent"),
            "area": kwargs.get("area"),
            "deadline": kwargs.get("deadline"),
            "when_date": kwargs.get("when_date"),
            "checklist": kwargs.get("checklist", []),
            "created": self._now(),
        }
        self.data["tasks"].append(task)
        self._save()
        return task

    def get_task(self, task_id):
        for task in self.data["tasks"]:
            if task["id"] == task_id:
                return task
        return None

    def update_task(self, task_id, **kwargs):
        task = self.get_task(task_id)
        if not task:
            return None
        allowed = {"title", "notes", "list", "tags", "parent", "area",
                    "deadline", "when_date", "checklist"}
        for key, value in kwargs.items():
            if key in allowed:
                task[key] = value
        self._save()
        return task

    def complete_task(self, task_id):
        """Move task (and its children) to archive as completed."""
        task = self.get_task(task_id)
        if not task:
            return None

        # Collect this task and all descendants
        to_complete = self._collect_subtree(task_id)
        for t in to_complete:
            t["list"] = "logbook"
            t["completed"] = self._now()
            self.archive["completed"].append(t)

        # Remove from active
        completed_ids = {t["id"] for t in to_complete}
        self.data["tasks"] = [t for t in self.data["tasks"] if t["id"] not in completed_ids]
        self._save()
        self._save_archive()
        return task

    def trash_task(self, task_id):
        """Move task (and its children) to archive as trashed."""
        task = self.get_task(task_id)
        if not task:
            return None

        to_trash = self._collect_subtree(task_id)
        for t in to_trash:
            t["list"] = "trash"
            self.archive["trashed"].append(t)

        trashed_ids = {t["id"] for t in to_trash}
        self.data["tasks"] = [t for t in self.data["tasks"] if t["id"] not in trashed_ids]
        self._save()
        self._save_archive()
        return task

    def delete_task(self, task_id):
        """Permanently remove from active data."""
        before = len(self.data["tasks"])
        self.data["tasks"] = [t for t in self.data["tasks"] if t["id"] != task_id]
        if len(self.data["tasks"]) < before:
            self._save()
            return True
        return False

    def _collect_subtree(self, task_id):
        """Collect a task and all its descendants."""
        result = []
        task = self.get_task(task_id)
        if task:
            result.append(task)
            children = [t for t in self.data["tasks"] if t.get("parent") == task_id]
            for child in children:
                result.extend(self._collect_subtree(child["id"]))
        return result

    def get_children(self, task_id):
        """Get direct children of a task."""
        return [t for t in self.data["tasks"] if t.get("parent") == task_id]

    def get_parent_tasks(self):
        """Get tasks that have children (i.e. 'projects')."""
        parent_ids = {t["parent"] for t in self.data["tasks"] if t.get("parent")}
        return [t for t in self.data["tasks"] if t["id"] in parent_ids]

    # ── Areas ─────────────────────────────────────────────────────────

    def add_area(self, title, **kwargs):
        area = {"title": title, "notes": kwargs.get("notes", "")}
        self.data["areas"].append(area)
        self._save()
        return area

    def get_areas(self):
        return self.data["areas"]

    # ── Queries (for the web UI) ──────────────────────────────────────

    def query_tasks(self, list_name=None, parent=None, area=None,
                    tag=None, search=None):
        results = []
        for t in self.data["tasks"]:
            if list_name and t["list"] != list_name:
                continue
            if parent is not None:
                if parent == "" and t.get("parent") is not None:
                    continue
                elif parent and t.get("parent") != parent:
                    continue
            if area and t.get("area") != area:
                continue
            if tag and tag not in t.get("tags", []):
                continue
            if search and not self._matches_search(t, search):
                continue
            results.append(t)
        results.sort(key=lambda x: x.get("created", ""), reverse=True)
        return results

    def get_summary(self):
        summary = {}
        for name in LISTS:
            summary[name] = len([t for t in self.data["tasks"] if t["list"] == name])
        # Logbook and trash counts from archive
        summary["logbook"] = len(self.archive.get("completed", []))
        summary["trash"] = len(self.archive.get("trashed", []))
        return summary

    def get_tags(self):
        tags = set()
        for t in self.data["tasks"]:
            for tag in t.get("tags", []):
                tags.add(tag)
        return sorted(tags)

    def get_archived(self, which="completed", limit=50):
        """Get recent archived items."""
        items = self.archive.get(which, [])
        return items[-limit:]

    def _matches_search(self, task, query):
        q = query.lower()
        return (q in task.get("title", "").lower()
                or q in task.get("notes", "").lower()
                or any(q in tag.lower() for tag in task.get("tags", [])))
