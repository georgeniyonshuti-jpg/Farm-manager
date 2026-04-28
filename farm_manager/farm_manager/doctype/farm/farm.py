import frappe
from frappe.model.document import Document


class Farm(Document):
	def autoname(self):
		if not self.farm_code:
			self.farm_code = frappe.scrub(self.farm_name).upper()[:20]

	def validate(self):
		if self.email:
			from frappe.utils import validate_email_address

			validate_email_address(self.email, throw=True)
