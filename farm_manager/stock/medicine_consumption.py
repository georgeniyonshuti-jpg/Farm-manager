"""Auto-generate Stock Entries for medicine consumption events."""
from __future__ import annotations

import frappe
from frappe.utils import flt, now_datetime


def _settings():
	if frappe.db.exists("DocType", "Farm Manager Settings"):
		return frappe.get_cached_doc("Farm Manager Settings")
	return None


def on_round_event_submit(doc, method=None):
	if doc.event_type != "Dose Recorded" or flt(doc.quantity_used) <= 0:
		return
	round_doc = frappe.get_doc("Treatment Round", doc.treatment_round)
	flock = frappe.get_doc("Flock", round_doc.flock)
	settings = _settings()

	se = frappe.new_doc("Stock Entry")
	se.stock_entry_type = "Material Issue"
	se.purpose = "Material Issue"
	se.posting_date = doc.event_at.split(" ")[0] if isinstance(doc.event_at, str) else doc.event_at.date()
	se.from_warehouse = flock.warehouse
	item_row = {
		"item_code": round_doc.medicine_item,
		"qty": flt(doc.quantity_used),
		"s_warehouse": flock.warehouse,
		"cost_center": flock.cost_center,
		"project": flock.project,
		"expense_account": settings.medicine_consumption_account if settings else None,
	}
	if doc.lot:
		batch = frappe.db.get_value("Medicine Lot", doc.lot, "batch")
		if batch:
			item_row["batch_no"] = batch
	se.append("items", item_row)
	se.flags.ignore_permissions = True
	try:
		se.insert()
		se.submit()
		frappe.db.set_value("Treatment Round Event", doc.name, "stock_entry", se.name)
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Medicine Stock Entry failure")
		frappe.msgprint(f"Could not auto-create stock entry: {e}", alert=True)
