# GTD Flow — Getting Things Done System

A conversational AI-powered productivity system based on David Allen's
**Getting Things Done** methodology, with a web interface inspired by
[Things](https://culturedcode.com/things/) by Cultured Code.

---

## The GTD Methodology

### What is GTD?

Getting Things Done (GTD) is a personal productivity methodology created by
David Allen. The core premise is simple: **your mind is for having ideas, not
holding them.** By capturing everything into a trusted external system and
processing it with clear decision rules, you free your mind to focus on actually
doing meaningful work.

GTD is not about getting more things done — it's about getting the *right*
things done with a "mind like water": calm, clear, and ready to respond
appropriately to whatever comes your way.

### The Five Stages of GTD

#### 1. Capture (Collect)

Get **everything** out of your head. Every task, idea, commitment, or random
thought — capture it into your **Inbox**. The key rules:

- Capture everything — no filtering at this stage.
- Use as few inboxes as possible (ideally one).
- Empty your capture tools regularly.

The barrier to capture must be as low as possible. If it takes effort to write
something down, you won't do it, and things will slip through the cracks.

#### 2. Clarify (Process)

Process each inbox item one at a time, in order, with these decision rules:

```
Is it actionable?
├── NO
│   ├── Trash it (not useful)
│   ├── Someday/Maybe (might do later)
│   └── Reference (useful info, file it)
└── YES → What's the next physical action?
    ├── < 2 minutes? → DO IT NOW
    ├── Someone else should do it? → DELEGATE (add to Waiting For)
    └── Otherwise → DEFER
        ├── Specific date/time? → Schedule it (Upcoming)
        └── No specific date? → Add to Anytime (next actions list)
```

**Critical rule**: never put an item back in the inbox. Every item must be
processed to a decision.

#### 3. Organize

Put clarified items where they belong:

| Destination       | What goes here                                        |
|--------------------|-------------------------------------------------------|
| **Next Actions**   | Single, concrete actions you can take right now        |
| **Projects**       | Outcomes requiring more than one action step           |
| **Waiting For**    | Items delegated to others (tracked with a tag/context) |
| **Calendar**       | Date-specific actions and hard deadlines               |
| **Someday/Maybe**  | Things you might want to do eventually                 |
| **Reference**      | Information you may need later (notes field)           |

**Contexts** are a key organizing tool. Tag actions with where you need to be
or what tools you need: `@computer`, `@phone`, `@errands`, `@home`, `@office`,
`@person-name`. When you're in a specific context, you can instantly filter for
relevant actions.

#### 4. Reflect (Review)

- **Daily Review**: Every morning, check your calendar and Today list. Pull in
  items from Anytime that feel right for the day given your energy, time, and
  priorities.

- **Weekly Review** (the critical habit — GTD lives or dies here):
  1. Get inbox to zero — process everything.
  2. Review every project — does each have a clear next action?
  3. Review Someday/Maybe — has anything become relevant?
  4. Review calendar — any upcoming deadlines or commitments?
  5. Review completed items — celebrate wins, note loose ends.
  6. Brain dump — is there anything new rattling around in your head?

#### 5. Engage (Do)

Choose what to do based on four criteria, in order:

1. **Context** — Where are you? What tools do you have?
2. **Time available** — How long until your next commitment?
3. **Energy** — Are you sharp or tired?
4. **Priority** — Of the remaining options, what has the highest payoff?

---

## Things-Inspired Data Model

This system uses a structure inspired by Things by Cultured Code, which
beautifully implements GTD concepts.

### Lists (Views)

| List         | GTD Concept       | Filter Logic                                          |
|--------------|-------------------|-------------------------------------------------------|
| **Inbox**    | Capture bucket    | `status == "inbox"`                                   |
| **Today**    | Next Actions      | `status == "active" AND when IN ("today", "evening")` |
| **Upcoming** | Tickler/Calendar  | `status == "active" AND when_date > today`            |
| **Anytime**  | Next Actions      | `status == "active" AND when == "anytime"`            |
| **Someday**  | Someday/Maybe     | `status == "active" AND when == "someday"`            |
| **Logbook**  | Completed archive | `status == "completed"`                               |
| **Trash**    | Discarded items   | `status == "cancelled"`                               |

### Organizational Units

| Unit          | Description                                                                 |
|---------------|-----------------------------------------------------------------------------|
| **Task**      | A single actionable item.                                                   |
| **Project**   | An outcome requiring multiple tasks. Should have a clear desired outcome and at least one next action. |
| **Area**      | An area of ongoing responsibility (Health, Finance, Work, Home). No end date — represents ongoing commitments. |
| **Tag**       | A label for categorization. Contexts use `context:` prefix (e.g., `context:office`). |
| **Checklist** | Sub-steps within a task.                                                    |

### Item Schema

Every task, project, and area is stored as a JSON file:

```json
{
  "id": "a1b2c3d4",
  "type": "task",
  "title": "Buy groceries",
  "notes": "Need milk, eggs, bread",
  "status": "active",
  "when": "anytime",
  "when_date": null,
  "deadline": null,
  "tags": ["errand", "context:store"],
  "area_id": null,
  "project_id": null,
  "checklist": [
    { "title": "Milk", "completed": false },
    { "title": "Eggs", "completed": true }
  ],
  "created_at": "2024-01-10T10:00:00Z",
  "updated_at": "2024-01-10T10:00:00Z",
  "completed_at": null
}
```

#### Field Reference

| Field          | Type                  | Description                                             |
|----------------|-----------------------|---------------------------------------------------------|
| `id`           | string                | Unique 8-character identifier                           |
| `type`         | `"task"` / `"project"` / `"area"` | What kind of item this is                  |
| `title`        | string                | Brief description                                       |
| `notes`        | string                | Additional details, reference material, links           |
| `status`       | `"inbox"` / `"active"` / `"completed"` / `"cancelled"` | Current state   |
| `when`         | `null` / `"today"` / `"evening"` / `"anytime"` / `"someday"` | Temporal bucket |
| `when_date`    | `null` / `"YYYY-MM-DD"` | Scheduled start date for Upcoming items               |
| `deadline`     | `null` / `"YYYY-MM-DD"` | Hard deadline (distinct from scheduled date)           |
| `tags`         | `string[]`            | Labels; contexts prefixed with `context:`               |
| `area_id`      | `null` / `string`     | Parent area of responsibility                           |
| `project_id`   | `null` / `string`     | Parent project                                          |
| `checklist`    | `{title, completed}[]`| Sub-steps within the item                               |
| `created_at`   | ISO 8601 datetime     | When the item was created                               |
| `updated_at`   | ISO 8601 datetime     | When the item was last modified                         |
| `completed_at` | ISO 8601 datetime / null | When the item was completed                          |

---

## Architecture

### Design Principles

1. **Flat-file storage** — Each item is a JSON file. Easy to read, debug,
   version control, and migrate to any other system.
2. **Simple REST API** — Standard HTTP endpoints for all CRUD operations.
3. **AI Agent** — OpenAI-powered conversational agent that understands GTD and
   can manipulate tasks through natural language.
4. **Minimal frontend** — Vanilla HTML, CSS, and JavaScript. No build step,
   no frameworks, no transpilation.
5. **Separation of concerns** — Store, agent, API server, and frontend are
   cleanly separated so any layer can be swapped out.

### System Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│     Browser      │────▶│   Flask Server   │────▶│   Task Store     │
│   (Vanilla JS)   │◀────│   (server.py)    │◀────│   (store.py)     │
│                  │     │                  │     │                  │
│  • Task list UI  │     │  • REST API      │     │  • JSON files    │
│  • Agent chat    │     │  • SSE streaming │     │  • CRUD ops      │
│  • Things-style  │     │  • Static files  │     │  • Query/filter  │
└─────────────────┘     └────────┬─────────┘     └──────────────────┘
                                 │
                        ┌────────▼─────────┐
                        │    GTD Agent     │
                        │   (agent.py)     │
                        │                  │
                        │  • OpenAI API    │
                        │  • Tool calling  │
                        │  • GTD coaching  │
                        └──────────────────┘
```

### File Structure

```
gtd/
├── README.md           # This file — methodology + architecture docs
├── requirements.txt    # Python dependencies
├── .env.example        # Environment variable template
├── server.py           # Flask HTTP server with API routes
├── agent.py            # OpenAI agent with GTD tools
├── store.py            # JSON flat-file data store
├── static/
│   ├── index.html      # Web frontend (single page)
│   ├── style.css       # Things-inspired stylesheet
│   └── app.js          # Frontend application logic
└── data/
    └── items/          # JSON files, one per task/project/area
        ├── a1b2c3d4.json
        └── ...
```

### Data Storage

Each task, project, and area is stored as an individual JSON file in
`data/items/`, named by its unique ID (e.g., `a1b2c3d4.json`). This approach:

- Makes individual items easy to inspect and edit manually.
- Plays nicely with version control (each item change is a separate diff).
- Requires no database installation or setup.
- Can be trivially migrated to any other storage backend.

Items are assigned to lists based on their `status` and `when` fields (see
**Lists** table above). There are no separate directories per list — the flat
structure with query-based filtering is simpler and avoids move operations.

### API Endpoints

| Method   | Path                | Description                              |
|----------|---------------------|------------------------------------------|
| `GET`    | `/api/items`        | List items. Query params: `list`, `project_id`, `area_id`, `tag`, `search` |
| `GET`    | `/api/items/:id`    | Get a single item by ID                  |
| `POST`   | `/api/items`        | Create a new item                        |
| `PUT`    | `/api/items/:id`    | Update an item                           |
| `DELETE` | `/api/items/:id`    | Delete an item permanently               |
| `GET`    | `/api/projects`     | List all projects                        |
| `GET`    | `/api/areas`        | List all areas                           |
| `GET`    | `/api/tags`         | List all unique tags                     |
| `GET`    | `/api/summary`      | Get item counts per list                 |
| `POST`   | `/api/agent/chat`   | Send message to GTD agent (SSE stream)   |
| `DELETE` | `/api/agent/history`| Clear agent conversation history         |

### Agent Tools

The AI agent has these tools for manipulating the GTD system:

| Tool             | Description                                            |
|------------------|--------------------------------------------------------|
| `capture`        | Quick-add an item to the inbox                         |
| `get_items`      | List items by list, project, context, or search        |
| `get_item`       | Get full details of a specific item                    |
| `create_task`    | Create a task with full details (when, tags, etc.)     |
| `update_task`    | Modify an existing task's properties                   |
| `complete_task`  | Mark a task as completed                               |
| `delete_task`    | Move a task to trash                                   |
| `create_project` | Create a new project                                   |
| `create_area`    | Create a new area of responsibility                    |
| `get_projects`   | List all projects with task counts                     |
| `get_areas`      | List all areas                                         |
| `search`         | Full-text search across all items                      |

### GTD Workflows via the Agent

The agent is trained to guide you through GTD processes:

| You say                          | Agent does                                             |
|----------------------------------|--------------------------------------------------------|
| "I need to call the dentist"     | Captures to inbox                                      |
| "Let's process my inbox"         | Walks through each item with clarifying questions      |
| "What should I do today?"        | Reviews Today list, suggests from Anytime by context   |
| "I'm at the store"              | Pulls up items tagged `context:store`                  |
| "Let's do a weekly review"       | Guides through the full GTD weekly review process      |
| "I want to plan my vacation"     | Creates a project, helps break into actionable tasks   |
| "I finished the report"          | Completes the task, checks project for next action     |

---

## Setup

```bash
cd gtd
pip install -r requirements.txt
cp .env.example .env        # Edit with your OpenAI API key
python server.py             # Open http://localhost:5001
```

## Environment Variables

| Variable         | Required | Description                    |
|------------------|----------|--------------------------------|
| `OPENAI_API_KEY` | Yes      | Your OpenAI API key            |
| `OPENAI_MODEL`   | No       | Model to use (default: gpt-4o) |
| `PORT`           | No       | Server port (default: 5001)    |
