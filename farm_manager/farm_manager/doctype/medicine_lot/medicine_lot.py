import frappe
from frappe.model.document import Document


class MedicineLot(Document):
	def before_insert(self):
		if not self.quantity_remaining:
			self.quantity_remaining = self.quantity_received
		if not self.batch and self.medicine_item:
			has_batch = frappe.db.get_value("Item", self.medicine_item, "has_batch_no")
			if has_batch:
				batch = frappe.new_doc("Batch")
				batch.item = self.medicine_item
				batch.batch_id = self.lot_number
				if self.expiry_date:
					batch.expiry_date = self.expiry_date
				batch.flags.ignore_permissions = True
				batch.insert()
				self.batch = batch.name
