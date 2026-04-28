import frappe
from frappe.model.document import Document
from frappe.utils import flt


class TreatmentRoundEvent(Document):
	def on_submit(self):
		if self.event_type == "Dose Recorded" and self.quantity_used and self.lot:
			lot = frappe.get_doc("Medicine Lot", self.lot)
			new_remaining = max(0, flt(lot.quantity_remaining) - flt(self.quantity_used))
			lot.db_set("quantity_remaining", new_remaining)

		round_doc = frappe.get_doc("Treatment Round", self.treatment_round)
		consumed = (
			frappe.db.sql(
				"""SELECT COALESCE(SUM(quantity_used), 0) FROM `tabTreatment Round Event`
				WHERE treatment_round = %s AND docstatus = 1""",
				self.treatment_round,
			)[0][0]
			or 0
		)
		round_doc.db_set("consumed_quantity", consumed)
		if self.event_type == "Completed":
			round_doc.db_set("status", "Completed")
		elif self.event_type == "Start":
			round_doc.db_set("status", "In Progress")
		elif self.event_type == "Missed":
			round_doc.db_set("status", "Missed")
