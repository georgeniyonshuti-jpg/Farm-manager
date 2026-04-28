import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class MortalityEvent(Document):
	def validate(self):
		if self.count <= 0:
			frappe.throw(_("Mortality count must be greater than zero"))
		flock = frappe.get_doc("Flock", self.flock)
		if self.count > flock.current_count:
			frappe.throw(
				_("Mortality count {0} exceeds current flock count {1}").format(
					self.count, flock.current_count
				)
			)
		if self.average_weight_kg and flock.live_bird_item:
			rate = frappe.db.get_value("Item", flock.live_bird_item, "valuation_rate") or 0
			self.estimated_loss_value = flt(rate) * flt(self.count) * flt(self.average_weight_kg)
