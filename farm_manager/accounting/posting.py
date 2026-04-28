"""Auto Journal Entry posting for accounting events."""
from __future__ import annotations

import frappe
from frappe.utils import flt, nowdate


def _settings():
	if frappe.db.exists("DocType", "Farm Manager Settings"):
		return frappe.get_cached_doc("Farm Manager Settings")
	return None


def _get_event_config(event_code: str, company: str | None = None):
	filters = {"event_code": event_code, "is_active": 1}
	if company:
		filters["company"] = company
	rows = frappe.get_all(
		"Accounting Event Config",
		filters=filters,
		fields=["name", "company", "debit_account", "credit_account",
		        "use_cost_center", "use_project", "auto_post", "requires_approval"],
		limit=1,
	)
	return rows[0] if rows else None


def post_journal_entry_for_event(event_code, amount, flock, reference_doctype,
                                  reference_name, posting_date=None, remarks=None):
	if flt(amount) <= 0:
		return None
	flock_doc = frappe.get_doc("Flock", flock) if flock else None
	company = (
		frappe.db.get_value("Farm", flock_doc.farm, "company") if flock_doc else None
	) or frappe.defaults.get_user_default("Company")
	cfg = _get_event_config(event_code, company)
	if not cfg:
		frappe.log_error(
			f"No Accounting Event Config for {event_code} / {company}",
			"Farm Manager accounting",
		)
		return None

	je = frappe.new_doc("Journal Entry")
	je.posting_date = posting_date or nowdate()
	je.company = cfg.company
	je.voucher_type = "Journal Entry"
	je.user_remark = remarks or f"{event_code} for flock {flock}"
	common = {
		"cost_center": flock_doc.cost_center if flock_doc and cfg.use_cost_center else None,
		"project": flock_doc.project if flock_doc and cfg.use_project else None,
		"reference_type": reference_doctype,
		"reference_name": reference_name,
	}
	je.append("accounts", {
		"account": cfg.debit_account,
		"debit_in_account_currency": flt(amount),
		**common,
	})
	je.append("accounts", {
		"account": cfg.credit_account,
		"credit_in_account_currency": flt(amount),
		**common,
	})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return je.name


def on_mortality_submit(doc, method=None):
	settings = _settings()
	if not settings or not settings.auto_create_journal_entry:
		return
	if not doc.estimated_loss_value or doc.estimated_loss_value <= 0:
		return
	post_journal_entry_for_event(
		event_code="MORTALITY_LOSS",
		amount=doc.estimated_loss_value,
		flock=doc.flock,
		reference_doctype="Mortality Event",
		reference_name=doc.name,
		posting_date=doc.event_date,
		remarks=f"Mortality of {doc.count} birds, reason: {doc.reason_code}",
	)


def on_slaughter_submit(doc, method=None):
	settings = _settings()
	if not settings or not settings.auto_create_journal_entry:
		return
	if not doc.processing_cost or doc.processing_cost <= 0:
		return
	post_journal_entry_for_event(
		event_code="SLAUGHTER_PROCESSING",
		amount=doc.processing_cost,
		flock=doc.flock,
		reference_doctype="Slaughter Event",
		reference_name=doc.name,
		posting_date=doc.event_date,
		remarks=f"Slaughter processing for {doc.bird_count} birds",
	)


def run_nightly_revaluation():
	"""Compute current_valuation per active flock based on stock + accruals."""
	for flock_name in frappe.get_all("Flock", filters={"status": "Active"}, pluck="name"):
		flock = frappe.get_doc("Flock", flock_name)
		valuation = 0
		if flock.live_bird_item:
			rate = frappe.db.get_value("Item", flock.live_bird_item, "valuation_rate") or 0
			if flock.current_avg_weight_kg and flock.current_count:
				valuation = flt(rate) * flt(flock.current_avg_weight_kg) * flt(flock.current_count)
		flock.db_set("current_valuation", valuation)
