# 0014: System radio inventory and isolated collection scopes

Status: proposed

Keep physical system radio identity separate from event-local telemetry
identity. An explicit current assignment pointer ensures one event at a time;
assignment records retain actor/time. Event-local rows/history never move
between events.

Use separate event/system YAROC session scopes, each with its own settings and
fencing generation. This preserves owner control of personal units without
granting control over system units. Group native clients by broker/channel
within a system collection. Serialize identity reservation and assignment
changes in SQL, not Redis.

Alternative: a shared event session makes owner Stop affect admin-controlled
units. Moving a LiveDevice between events incorrectly moves history and retry
identity. Keep the existing native YAROC dependency and protocol decoder.
