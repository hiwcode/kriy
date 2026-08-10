# Schedules

Schedules let you run agents automatically — either at a specific time or on a recurring basis using cron expressions.

## Create a Schedule

1. Go to **Schedules** in the sidebar (under Automation)
2. Click **Create Schedule**
3. Fill in:
   - **Name** — Display name for the schedule
   - **Agent** — Which agent to run
   - **Message** — The prompt to send to the agent
   - **Type** — One-time or Recurring
   - **Run At** — (One-time) Specific date and time
   - **Cron Expression** — (Recurring) Standard cron syntax
   - **Max Runs** — (Optional) Stop after N executions
4. Click **Create**

### Cron Expression Examples

| Expression | Meaning |
|-----------|---------|
| `0 * * * *` | Every hour |
| `0 9 * * *` | Daily at 9:00 AM |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `*/30 * * * *` | Every 30 minutes |
| `0 0 * * 0` | Every Sunday at midnight |
| `0 9 1 * *` | First day of every month at 9:00 AM |

---

## Manage Schedules

The schedules page shows a table with:

| Column | Description |
|--------|-------------|
| **Name** | Schedule name |
| **Agent** | Which agent runs |
| **Type** | One-time or Recurring |
| **Cron / Run At** | Cron expression or scheduled datetime |
| **Status** | Active, Paused, or Completed |
| **Next Run** | When it will run next |
| **Last Run** | When it last ran |
| **Runs** | Execution count (and max if set) |

### Actions

- **Run Now** — Trigger the schedule immediately
- **Pause / Resume** — Toggle schedule status
- **View Last Result** — See the agent's output from the last run
- **Delete** — Remove the schedule

---

## Schedule as Agent Tool

Agents can create their own schedules using the `schedule` built-in tool. Add it to an agent's tools, and the agent gets:

- `create_schedule` — Create a one-time or recurring schedule
- `list_schedules` — List all schedules in the workspace
- `delete_schedule` — Delete a schedule by ID

Example: Ask your agent *"Remind me to check the server logs every morning at 9am"* and it will create a recurring schedule.

---

## How It Works

1. A background task starts when the server boots
2. Every 30 seconds, it checks for schedules where `next_run_at <= NOW()`
3. For each due schedule, it builds and runs the agent with the schedule's message
4. After execution, it updates `last_run_at`, `last_run_status`, `last_run_result`, and `run_count`
5. For recurring schedules, it computes the next run time from the cron expression
6. If `max_runs` is set and reached, the schedule status changes to `completed`

---

## Workspace Scoping

- Schedules are scoped to the **active workspace**
- The schedule uses the API key of the user who created it (or the triggering user for manual runs)
