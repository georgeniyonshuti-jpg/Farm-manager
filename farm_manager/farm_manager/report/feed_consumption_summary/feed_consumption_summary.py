from __future__ import annotations

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	conditions = "ffe.docstatus = 1"
	values: dict = {}
	if filters.get("flock"):
		conditions += " AND ffe.flock = %(flock)s"
		values["flock"] = filters["flock"]
	if filters.get("from_date"):
		conditions += " AND ffe.entry_date >= %(from_date)s"
		values["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		conditions += " AND ffe.entry_date <= %(to_date)s"
		values["to_date"] = filters["to_date"]

	rows = frappe.db.sql(
		f"""
		SELECT
			ffe.flock,
			ffe.feed_phase,
			SUM(ffe.quantity_kg) AS total_kg,
			SUM(ffe.amount) AS total_amount,
			COUNT(*) AS entries
		FROM `tabFlock Feed Entry` ffe
		WHERE {conditions}
		GROUP BY ffe.flock, ffe.feed_phase
		ORDER BY ffe.flock, ffe.feed_phase
		""",
		values,
		as_dict=True,
	)
	columns = [
		{"label": _("Flock"), "fieldname": "flock", "fieldtype": "Link", "options": "Flock", "width": 150},
		{"label": _("Phase"), "fieldname": "feed_phase", "fieldtype": "Data", "width": 100},
		{"label": _("Total (kg)"), "fieldname": "total_kg", "fieldtype": "Float", "width": 130},
		{"label": _("Amount"), "fieldname": "total_amount", "fieldtype": "Currency", "width": 130},
		{"label": _("Entries"), "fieldname": "entries", "fieldtype": "Int", "width": 80},
	]
	return columns, rows
