"""Auto-generate Stock Entries for feed consumption events."""
from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, nowdate


def _settings():
	if frappe.db.exists("DocType", "Farm Manager Settings"):
		return frappe.get_cached_doc("Farm Manager Settings")
	return None


def _make_material_issue(item_code: str, qty: float, source_warehouse: str, posting_date: str,
                         flock: str, cost_center: str | None, project: str | None,
                         expense_account: str | None, reference_doc: str, reference_name: str):
	if not item_code or qty <= 0 or not source_warehouse:
		return None
	se = frappe.new_doc("Stock Entry")
	se.stock_entry_type = "Material Issue"
	se.purpose = "Material Issue"
	se.posting_date = posting_date or nowdate()
	se.from_warehouse = source_warehouse
	se.append(
		"items",
		{
			"item_code": item_code,
			"qty": qty,
			"s_warehouse": source_warehouse,
			"cost_center": cost_center,
			"project": project,
			"expense_account": expense_account,
		},
	)
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()
	frappe.db.set_value(reference_doc, reference_name, "stock_entry", se.name)
	return se.name


def _cancel_linked_stock_entry(reference_doc: str, reference_name: str):
	se_name = frappe.db.get_value(reference_doc, reference_name, "stock_entry")
	if se_name and frappe.db.get_value("Stock Entry", se_name, "docstatus") == 1:
		se = frappe.get_doc("Stock Entry", se_name)
		se.flags.ignore_permissions = True
		se.cancel()


def on_daily_log_submit(doc, method=None):
	"""Generate a Material Issue for feed_intake_kg if any."""
	if flt(doc.feed_intake_kg) <= 0:
		return
	flock = frappe.get_doc("Flock", doc.flock)
	settings = _settings()
	feed_item = frappe.db.get_single_value("Farm Manager Settings", "default_feed_item") if frappe.db.exists(
		"DocType", "Farm Manager Settings"
	) else None
	if not feed_item:
		return  # silently skip if not configured (laborer logs may be ahead of bookkeeping)

	_make_material_issue(
		item_code=feed_item,
		qty=flt(doc.feed_intake_kg),
		source_warehouse=flock.warehouse,
		posting_date=doc.log_date,
		flock=doc.flock,
		cost_center=flock.cost_center,
		project=flock.project,
		expense_account=settings.feed_consumption_account if settings else None,
		reference_doc="Flock Daily Log",
		reference_name=doc.name,
	)


def on_daily_log_cancel(doc, method=None):
	_cancel_linked_stock_entry("Flock Daily Log", doc.name)


def on_feed_entry_submit(doc, method=None):
	flock = frappe.get_doc("Flock", doc.flock)
	settings = _settings()
	_make_material_issue(
		item_code=doc.feed_item,
		qty=flt(doc.quantity_kg),
		source_warehouse=flock.warehouse,
		posting_date=doc.entry_date,
		flock=doc.flock,
		cost_center=flock.cost_center,
		project=flock.project,
		expense_account=settings.feed_consumption_account if settings else None,
		reference_doc="Flock Feed Entry",
		reference_name=doc.name,
	)


def on_feed_entry_cancel(doc, method=None):
	_cancel_linked_stock_entry("Flock Feed Entry", doc.name)
