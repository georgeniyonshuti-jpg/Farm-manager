import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class FlockFeedEntry(Document):
	def validate(self):
		if flt(self.quantity_kg) <= 0:
			frappe.throw(_("Quantity must be greater than zero"))
		if self.feed_item and self.quantity_kg:
			rate = frappe.db.get_value("Item", self.feed_item, "valuation_rate") or 0
			self.rate_per_kg = rate
			self.amount = flt(rate) * flt(self.quantity_kg)
