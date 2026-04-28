"""Daily mortality trend per flock."""
from __future__ import annotations

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	conditions = "docstatus = 1"
	values: dict = {}
	if filters.get("flock"):
		conditions += " AND flock = %(flock)s"
		values["flock"] = filters["flock"]
	if filters.get("from_date"):
		conditions += " AND log_date >= %(from_date)s"
		values["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		conditions += " AND log_date <= %(to_date)s"
		values["to_date"] = filters["to_date"]

	rows = frappe.db.sql(
		f"""
		SELECT
			flock,
			log_date,
			mortality,
			mortality_pct_of_initial,
			flagged_high_mortality,
			feed_intake_kg,
			water_liters
		FROM `tabFlock Daily Log`
		WHERE {conditions}
		ORDER BY flock, log_date
		""",
		values,
		as_dict=True,
	)
	columns = [
		{"label": _("Flock"), "fieldname": "flock", "fieldtype": "Link", "options": "Flock", "width": 150},
		{"label": _("Date"), "fieldname": "log_date", "fieldtype": "Date", "width": 100},
		{"label": _("Mortality"), "fieldname": "mortality", "fieldtype": "Int", "width": 100},
		{"label": _("Mort % Initial"), "fieldname": "mortality_pct_of_initial", "fieldtype": "Percent", "width": 130},
		{"label": _("Flagged"), "fieldname": "flagged_high_mortality", "fieldtype": "Check", "width": 80},
		{"label": _("Feed (kg)"), "fieldname": "feed_intake_kg", "fieldtype": "Float", "width": 100},
		{"label": _("Water (L)"), "fieldname": "water_liters", "fieldtype": "Float", "width": 100},
	]
	chart = {
		"data": {
			"labels": [str(r.log_date) for r in rows],
			"datasets": [
				{"name": "Mortality", "values": [r.mortality for r in rows]},
				{"name": "Feed (kg)", "values": [r.feed_intake_kg for r in rows]},
			],
		},
		"type": "line",
		"colors": ["#e74c3c", "#3498db"],
	}
	return columns, rows, None, chart
