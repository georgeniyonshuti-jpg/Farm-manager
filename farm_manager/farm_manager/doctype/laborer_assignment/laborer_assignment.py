import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class LaborerAssignment(Document):
	def validate(self):
		if flt(self.allocation_pct) <= 0 or flt(self.allocation_pct) > 100:
			frappe.throw(_("Allocation % must be between 0 and 100"))
		# Validate total allocation per employee on date range does not exceed 100%
		overlapping = frappe.db.sql(
			"""
			SELECT COALESCE(SUM(allocation_pct), 0) AS total
			FROM `tabLaborer Assignment`
			WHERE employee = %s AND is_active = 1 AND name != %s
			  AND (
				(from_date <= %s AND (to_date IS NULL OR to_date >= %s))
				OR (from_date <= %s AND (to_date IS NULL OR to_date >= %s))
				OR (from_date >= %s AND from_date <= %s)
			  )
			""",
			(
				self.employee,
				self.name or "",
				self.from_date,
				self.from_date,
				self.to_date or self.from_date,
				self.to_date or self.from_date,
				self.from_date,
				self.to_date or "9999-12-31",
			),
			as_dict=True,
		)[0].total
		if (flt(overlapping) + flt(self.allocation_pct)) > 100:
			frappe.throw(
				_("Employee {0} would exceed 100% allocation in this period").format(self.employee)
			)
