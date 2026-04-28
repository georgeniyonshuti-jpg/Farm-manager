"""On Salary Slip submit, allocate cost across flocks per Laborer Assignment."""
from __future__ import annotations

import frappe
from frappe.utils import flt, getdate


def allocate_salary_to_flocks(doc, method=None):
	"""Create a Flock Payroll Allocation that distributes net pay among flocks the
	employee was assigned to during the salary period."""
	posting_date = getdate(doc.posting_date or doc.start_date)
	period_start = getdate(doc.start_date)
	period_end = getdate(doc.end_date)
	assignments = frappe.get_all(
		"Laborer Assignment",
		filters={
			"employee": doc.employee,
			"is_active": 1,
		},
		fields=["name", "flock", "allocation_pct", "from_date", "to_date"],
	)
	in_period = []
	for a in assignments:
		fr = getdate(a.from_date)
		to = getdate(a.to_date) if a.to_date else getdate("2999-12-31")
		if fr <= period_end and to >= period_start:
			in_period.append(a)
	if not in_period:
		return  # no farm assignment - skip allocation

	if frappe.db.exists("Flock Payroll Allocation", {"salary_slip": doc.name}):
		return  # already allocated

	total_pct = sum(flt(a.allocation_pct) for a in in_period)
	if total_pct <= 0:
		return

	alloc = frappe.new_doc("Flock Payroll Allocation")
	alloc.salary_slip = doc.name
	alloc.employee = doc.employee
	alloc.posting_date = posting_date
	alloc.total_amount = doc.net_pay or 0
	for a in in_period:
		share_pct = flt(a.allocation_pct) / total_pct * 100
		alloc.append(
			"lines",
			{
				"flock": a.flock,
				"cost_center": frappe.db.get_value("Flock", a.flock, "cost_center"),
				"allocation_pct": share_pct,
				"allocated_amount": round(flt(doc.net_pay or 0) * (share_pct / 100), 2),
			},
		)
	# Distribute rounding diff into the largest line
	allocated_total = sum(flt(l.allocated_amount) for l in alloc.lines)
	diff = round(flt(doc.net_pay or 0) - allocated_total, 2)
	if diff != 0 and alloc.lines:
		alloc.lines[0].allocated_amount = round(flt(alloc.lines[0].allocated_amount) + diff, 2)
	alloc.flags.ignore_permissions = True
	alloc.insert()
