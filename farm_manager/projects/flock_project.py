"""Bridge between Flock lifecycle and ERPNext Project."""
from __future__ import annotations

import frappe
from frappe.utils import getdate


_STATUS_MAP = {
	"Planned": "Open",
	"Active": "Open",
	"Harvested": "Completed",
	"Archived": "Cancelled",
	"Lost": "Cancelled",
}


def create_project_for_flock(doc, method=None):
	if doc.project:
		return
	project_name = f"Flock {doc.flock_code or doc.name}"
	project = frappe.new_doc("Project")
	project.project_name = project_name
	project.expected_start_date = doc.placement_date
	project.expected_end_date = doc.expected_harvest_date
	project.status = _STATUS_MAP.get(doc.status, "Open")
	project.cost_center = doc.cost_center
	project.flags.ignore_permissions = True
	project.insert()
	doc.db_set("project", project.name)


def sync_project_status(doc, method=None):
	if not doc.project:
		return
	project_status = _STATUS_MAP.get(doc.status, "Open")
	current = frappe.db.get_value("Project", doc.project, "status")
	if current != project_status:
		frappe.db.set_value("Project", doc.project, "status", project_status)
	if doc.harvest_date:
		frappe.db.set_value("Project", doc.project, "actual_end_date", getdate(doc.harvest_date))
