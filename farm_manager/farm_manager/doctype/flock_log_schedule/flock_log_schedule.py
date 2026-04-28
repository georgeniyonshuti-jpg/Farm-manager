import frappe
from frappe.model.document import Document
from frappe.utils import nowdate


class FlockLogSchedule(Document):
	pass


@frappe.whitelist()
def create_daily_log_reminders():
	today = nowdate()
	for sched in frappe.get_all(
		"Flock Log Schedule",
		filters={"is_active": 1},
		fields=["name", "flock", "assigned_to"],
	):
		exists = frappe.db.exists(
			"ToDo",
			{
				"reference_type": "Flock",
				"reference_name": sched.flock,
				"date": today,
				"status": "Open",
			},
		)
		if exists:
			continue
		todo = frappe.new_doc("ToDo")
		todo.allocated_to = sched.assigned_to
		todo.reference_type = "Flock"
		todo.reference_name = sched.flock
		todo.description = f"Submit daily log for flock {sched.flock}"
		todo.date = today
		todo.priority = "Medium"
		todo.insert(ignore_permissions=True)
