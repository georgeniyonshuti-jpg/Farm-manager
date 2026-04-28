import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class AccountingApproval(Document):
	def before_submit(self):
		if self.status != "Approved":
			frappe.throw(_("Approval must be set to Approved before submitting"))
		self.approved_by = frappe.session.user
		self.approved_at = now_datetime()

	def on_submit(self):
		from farm_manager.accounting.posting import post_journal_entry_for_event

		je_name = post_journal_entry_for_event(
			event_code=self.event_code,
			amount=self.amount,
			flock=self.flock,
			reference_doctype=self.reference_doctype,
			reference_name=self.reference_name,
		)
		if je_name:
			self.db_set("journal_entry", je_name)
			self.db_set("status", "Posted")
