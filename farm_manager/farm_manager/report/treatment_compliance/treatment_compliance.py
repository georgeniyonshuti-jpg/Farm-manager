from __future__ import annotations

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	conditions = "1=1"
	values: dict = {}
	if filters.get("flock"):
		conditions += " AND flock = %(flock)s"
		values["flock"] = filters["flock"]
	if filters.get("from_date"):
		conditions += " AND DATE(planned_for) >= %(from_date)s"
		values["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		conditions += " AND DATE(planned_for) <= %(to_date)s"
		values["to_date"] = filters["to_date"]

	rows = frappe.db.sql(
		f"""
		SELECT
			flock,
			medicine_item,
			route,
			status,
			planned_for,
			planned_quantity,
			consumed_quantity,
			(consumed_quantity / NULLIF(planned_quantity,0) * 100) AS compliance_pct
		FROM `tabTreatment Round`
		WHERE {conditions}
		ORDER BY planned_for DESC
		""",
		values,
		as_dict=True,
	)
	columns = [
		{"label": _("Flock"), "fieldname": "flock", "fieldtype": "Link", "options": "Flock", "width": 130},
		{"label": _("Medicine"), "fieldname": "medicine_item", "fieldtype": "Link", "options": "Item", "width": 130},
		{"label": _("Route"), "fieldname": "route", "fieldtype": "Data", "width": 100},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
		{"label": _("Planned For"), "fieldname": "planned_for", "fieldtype": "Datetime", "width": 150},
		{"label": _("Planned"), "fieldname": "planned_quantity", "fieldtype": "Float", "width": 100},
		{"label": _("Consumed"), "fieldname": "consumed_quantity", "fieldtype": "Float", "width": 100},
		{"label": _("Compliance %"), "fieldname": "compliance_pct", "fieldtype": "Percent", "width": 130},
	]
	return columns, rows
