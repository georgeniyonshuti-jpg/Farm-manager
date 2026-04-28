"""Whitelisted REST API endpoints exposed by Farm Manager."""
from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt


@frappe.whitelist()
def get_active_flocks(farm: str | None = None):
	filters = {"status": ("in", ["planned", "active"])}
	if farm:
		filters["farm"] = farm
	return frappe.get_all(
		"Flock",
		filters=filters,
		fields=[
			"name",
			"flock_code",
			"farm",
			"house",
			"breed_code",
			"placement_date",
			"initial_count",
			"current_count",
			"status",
			"project",
		],
		order_by="placement_date desc",
	)


@frappe.whitelist()
def flock_dashboard(flock: str):
	if not frappe.has_permission("Flock", "read", doc=flock):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	flock_doc = frappe.get_doc("Flock", flock)

	totals = frappe.db.sql(
		"""
		SELECT
			COALESCE(SUM(mortality), 0) AS total_mortality,
			COALESCE(SUM(feed_intake_kg), 0) AS total_feed,
			COALESCE(SUM(water_liters), 0) AS total_water
		FROM `tabFlock Daily Log`
		WHERE flock = %s AND docstatus = 1
		""",
		flock,
		as_dict=True,
	)[0]

	weighins = frappe.get_all(
		"Flock Weigh-in",
		filters={"flock": flock},
		fields=["weigh_date", "avg_weight_kg", "fcr", "variance_pct"],
		order_by="weigh_date asc",
	)

	return {
		"flock": flock_doc.as_dict(),
		"totals": totals,
		"weighins": weighins,
		"current_count": (flock_doc.initial_count or 0) - flt(totals.total_mortality),
	}


@frappe.whitelist()
def submit_check_in(flock: str, log_date: str, payload: dict):
	"""Mobile-friendly endpoint for laborer check-ins."""
	doc = frappe.new_doc("Flock Check-in")
	doc.flock = flock
	doc.check_in_date = log_date
	doc.update(payload or {})
	doc.insert()
	return {"name": doc.name}
