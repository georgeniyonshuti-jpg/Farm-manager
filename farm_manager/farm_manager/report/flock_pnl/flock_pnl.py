"""Per-flock P&L based on linked Project / Cost Center GL data."""
from __future__ import annotations

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	conditions = "1=1"
	values: dict = {}
	if filters.get("flock"):
		conditions += " AND f.name = %(flock)s"
		values["flock"] = filters["flock"]

	rows = frappe.db.sql(
		f"""
		SELECT
			f.name AS flock,
			f.farm,
			f.placement_date,
			f.status,
			f.cost_center,
			COALESCE(s.revenue, 0) AS revenue,
			COALESCE(p.purchases, 0) AS purchases,
			COALESCE(j.expenses, 0) AS journal_expenses,
			(COALESCE(s.revenue, 0) - COALESCE(p.purchases, 0) - COALESCE(j.expenses, 0)) AS gross_margin
		FROM `tabFlock` f
		LEFT JOIN (
			SELECT pso.flock, SUM(pso.total_amount) AS revenue
			FROM `tabPoultry Sales Order` pso
			WHERE pso.docstatus = 1
			GROUP BY pso.flock
		) s ON s.flock = f.name
		LEFT JOIN (
			SELECT fp.flock, SUM(fp.total_amount) AS purchases
			FROM `tabFarm Purchase` fp
			WHERE fp.docstatus = 1
			GROUP BY fp.flock
		) p ON p.flock = f.name
		LEFT JOIN (
			SELECT je.cost_center, SUM(jea.debit_in_account_currency) AS expenses
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je2 ON je2.name = jea.parent AND je2.docstatus = 1
			JOIN `tabFlock` flk ON flk.cost_center = jea.cost_center
			JOIN `tabAccount` acc ON acc.name = jea.account AND acc.root_type = 'Expense'
			GROUP BY jea.cost_center
		) j ON j.cost_center = f.cost_center
		WHERE {conditions}
		ORDER BY f.placement_date DESC
		""",
		values,
		as_dict=True,
	)
	columns = [
		{"label": _("Flock"), "fieldname": "flock", "fieldtype": "Link", "options": "Flock", "width": 150},
		{"label": _("Farm"), "fieldname": "farm", "fieldtype": "Link", "options": "Farm", "width": 120},
		{"label": _("Placement"), "fieldname": "placement_date", "fieldtype": "Date", "width": 100},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
		{"label": _("Revenue"), "fieldname": "revenue", "fieldtype": "Currency", "width": 130},
		{"label": _("Purchases"), "fieldname": "purchases", "fieldtype": "Currency", "width": 130},
		{"label": _("Other Expenses"), "fieldname": "journal_expenses", "fieldtype": "Currency", "width": 140},
		{"label": _("Gross Margin"), "fieldname": "gross_margin", "fieldtype": "Currency", "width": 140},
	]
	return columns, rows
