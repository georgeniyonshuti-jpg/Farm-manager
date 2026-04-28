import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class PoultrySalesOrder(Document):
	def validate(self):
		if self.number_of_birds <= 0 or self.total_weight_kg <= 0:
			frappe.throw(_("Birds and weight must be greater than zero"))
		flock = frappe.get_doc("Flock", self.flock)
		if self.number_of_birds > flock.current_count:
			frappe.throw(
				_("Cannot sell {0} birds, flock has only {1} remaining").format(
					self.number_of_birds, flock.current_count
				)
			)
		self.total_amount = flt(self.total_weight_kg) * flt(self.price_per_kg)
		self.average_weight_kg = (
			flt(self.total_weight_kg) / flt(self.number_of_birds)
			if self.number_of_birds
			else 0
		)
