import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class FlockPayrollAllocation(Document):
	def validate(self):
		total = sum(flt(l.allocated_amount) for l in (self.lines or []))
		if abs(total - flt(self.total_amount)) > 0.01:
			frappe.throw(
				_("Sum of allocations {0} does not match total {1}").format(total, self.total_amount)
			)
