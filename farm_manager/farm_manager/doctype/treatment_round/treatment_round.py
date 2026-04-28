"""Treatment Round controller. Tracks veterinary medication runs."""
import frappe
from frappe.model.document import Document
from frappe.utils import flt, now_datetime


class TreatmentRound(Document):
	def validate(self):
		if flt(self.planned_quantity) <= 0:
			frappe.throw("Planned quantity must be greater than zero")


@frappe.whitelist()
def flag_missed_rounds():
	"""Set status=Missed for any rounds whose window_end < now and not Completed."""
	now = now_datetime()
	rounds = frappe.get_all(
		"Treatment Round",
		filters={
			"status": ("in", ["Planned", "In Progress"]),
			"window_end": ("<", now),
		},
		pluck="name",
	)
	for r in rounds:
		frappe.db.set_value("Treatment Round", r, "status", "Missed")
