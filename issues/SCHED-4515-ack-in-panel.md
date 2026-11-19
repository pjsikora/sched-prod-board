---
id: SCHED-4515
title: Ack moves from the row into an incident panel
status: done
plan: R2 (revised)
---

Step-1 recording, 00:28: on-call aimed at Ack on INC-8351, a new incident landed at the top, the rows moved
down one place and the click acked INC-2346 instead.

Product's decision: "New incidents stay live at the top. Ack leaves the row: a row opens its incident panel,
and Ack lives there."

- Rows have no Ack button (`data-testid="ack"` removed). A row is a button that opens its panel.
- The panel (`data-testid="incident-panel"`, `data-id`) names the incident id and holds Ack
  (`data-testid="panel-ack"`), which acks the id the panel names.
- The row keeps its acked mark (`data-testid="acked"`).

Acceptance: a click that lands on the wrong row opens a panel that names the wrong incident; nothing is acked
until Ack is pressed in a panel that names the incident on-call meant.
