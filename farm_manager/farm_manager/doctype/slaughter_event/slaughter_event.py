import frappe
from frappe import _
from frappe.model.document import Document


class SlaughterEvent(Document):
	def validate(self):
		flock = frappe.get_doc("Flock", self.flock)
		if self.bird_count > flock.current_count:
			frappe.throw(
				_("Slaughter count {0} exceeds current flock count {1}").format(
					self.bird_count, flock.current_count
				)
			)
