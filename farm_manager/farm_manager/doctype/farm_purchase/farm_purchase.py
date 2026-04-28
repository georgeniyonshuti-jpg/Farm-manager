import frappe
from frappe.model.document import Document
from frappe.utils import flt


class FarmPurchase(Document):
	def validate(self):
		total = sum(flt(i.amount) for i in (self.items or []))
		self.total_amount = total
