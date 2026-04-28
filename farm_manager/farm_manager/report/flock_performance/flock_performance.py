"""Flock Performance script report."""
from __future__ import annotations

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	conditions = ""
	values: dict = {}
	if filters.get("farm"):
		conditions += " AND farm = %(farm)s"
		values["farm"] = filters["farm"]
	if filters.get("status"):
		conditions += " AND status = %(status)s"
		values["status"] = filters["status"]
	if filters.get("from_date"):
		conditions += " AND placement_date >= %(from_date)s"
		values["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		conditions += " AND placement_date <= %(to_date)s"
		values["to_date"] = filters["to_date"]

	rows = frappe.db.sql(
		f"""
		SELECT
			name AS flock,
			flock_code,
			farm,
			house,
			breed_code,
			status,
			placement_date,
			age_days,
			initial_count,
			current_count,
			mortality_total,
			mortality_pct,
			feed_consumed_kg,
			fcr_running,
			current_avg_weight_kg,
			current_valuation
		FROM `tabFlock`
		WHERE 1=1 {conditions}
		ORDER BY placement_date DESC
		""",
		values,
		as_dict=True,
	)

	columns = [
		{"label": _("Flock"), "fieldname": "flock", "fieldtype": "Link", "options": "Flock", "width": 150},
		{"label": _("Code"), "fieldname": "flock_code", "fieldtype": "Data", "width": 120},
		{"label": _("Farm"), "fieldname": "farm", "fieldtype": "Link", "options": "Farm", "width": 120},
		{"label": _("House"), "fieldname": "house", "fieldtype": "Link", "options": "Farm House", "width": 100},
		{"label": _("Breed"), "fieldname": "breed_code", "fieldtype": "Data", "width": 100},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 90},
		{"label": _("Placement"), "fieldname": "placement_date", "fieldtype": "Date", "width": 100},
		{"label": _("Age"), "fieldname": "age_days", "fieldtype": "Int", "width": 60},
		{"label": _("Initial"), "fieldname": "initial_count", "fieldtype": "Int", "width": 80},
		{"label": _("Current"), "fieldname": "current_count", "fieldtype": "Int", "width": 80},
		{"label": _("Mortality"), "fieldname": "mortality_total", "fieldtype": "Int", "width": 90},
		{"label": _("Mort %"), "fieldname": "mortality_pct", "fieldtype": "Percent", "width": 80},
		{"label": _("Feed (kg)"), "fieldname": "feed_consumed_kg", "fieldtype": "Float", "width": 100},
		{"label": _("FCR"), "fieldname": "fcr_running", "fieldtype": "Float", "precision": "2", "width": 70},
		{"label": _("Avg Wt (kg)"), "fieldname": "current_avg_weight_kg", "fieldtype": "Float", "precision": "3", "width": 100},
		{"label": _("Valuation"), "fieldname": "current_valuation", "fieldtype": "Currency", "width": 120},
	]
	return columns, rows
