"""Flock Daily Log controller."""
from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime


class FlockDailyLog(Document):
	def validate(self):
		validate_high_mortality(self, method="validate")
		self.compute_mortality_pct()
		self.enforce_unique_per_day()

	def before_submit(self):
		self.validation_status = "Submitted"
		self.submitted_at = now_datetime()

	def on_update_after_submit(self):
		"""Allow vet to set Approved / Rejected without amend."""
		old = self.get_doc_before_save()
		if not old:
			return
		if old.validation_status != self.validation_status and self.validation_status in (
			"Approved",
			"Rejected",
		):
			self.reviewed_by = frappe.session.user
			self.reviewed_at = now_datetime()
			self.db_set("reviewed_by", self.reviewed_by)
			self.db_set("reviewed_at", self.reviewed_at)

	def enforce_unique_per_day(self):
		existing = frappe.db.exists(
			"Flock Daily Log",
			{
				"flock": self.flock,
				"log_date": self.log_date,
				"docstatus": ("<", 2),
				"name": ("!=", self.name or ""),
			},
		)
		if existing:
			frappe.throw(
				_("A daily log already exists for this flock on {0}: {1}").format(
					self.log_date, existing
				)
			)

	def compute_mortality_pct(self):
		flock_initial = frappe.db.get_value("Flock", self.flock, "initial_count") or 0
		if flock_initial:
			self.mortality_pct_of_initial = (flt(self.mortality or 0) / flock_initial) * 100
		else:
			self.mortality_pct_of_initial = 0


def validate_high_mortality(doc, method=None):
	"""Set the high-mortality flag based on settings."""
	settings = frappe.get_cached_doc("Farm Manager Settings") if frappe.db.exists(
		"DocType", "Farm Manager Settings"
	) else None
	threshold = (
		flt(settings.high_mortality_pct_threshold) if settings and settings.high_mortality_pct_threshold else 0.5
	)
	doc.flagged_high_mortality = (flt(doc.mortality_pct_of_initial or 0) >= threshold)
