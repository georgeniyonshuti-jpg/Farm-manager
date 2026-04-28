from frappe.model.document import Document


class Prescription(Document):
	def before_submit(self):
		self.status = "Active"

	def before_cancel(self):
		self.status = "Cancelled"
