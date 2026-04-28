"""Translate Farm Purchase into ERPNext Purchase Receipt + Purchase Invoice."""
from __future__ import annotations

import frappe
from frappe.utils import flt


def _resolve_warehouse(doc):
	if doc.flock:
		return frappe.db.get_value("Flock", doc.flock, "warehouse")
	if doc.farm:
		return frappe.db.get_value("Farm", doc.farm, "default_warehouse")
	return frappe.db.get_single_value("Farm Manager Settings", "default_warehouse") if frappe.db.exists(
		"DocType", "Farm Manager Settings"
	) else None


def _resolve_cost_center(doc):
	if doc.flock:
		return frappe.db.get_value("Flock", doc.flock, "cost_center")
	if doc.farm:
		return frappe.db.get_value("Farm", doc.farm, "default_cost_center")
	return frappe.db.get_single_value("Farm Manager Settings", "default_cost_center") if frappe.db.exists(
		"DocType", "Farm Manager Settings"
	) else None


def _resolve_project(doc):
	if doc.flock:
		return frappe.db.get_value("Flock", doc.flock, "project")
	return None


def on_purchase_submit(doc, method=None):
	warehouse = _resolve_warehouse(doc)
	cost_center = _resolve_cost_center(doc)
	project = _resolve_project(doc)
	if not warehouse:
		frappe.throw("Cannot determine warehouse for Farm Purchase. Set Farm or Flock with default warehouse.")

	# Purchase Receipt
	pr = frappe.new_doc("Purchase Receipt")
	pr.supplier = doc.supplier
	pr.posting_date = doc.purchase_date
	pr.set_warehouse = warehouse
	for row in doc.items:
		pr.append(
			"items",
			{
				"item_code": row.item,
				"qty": row.qty,
				"uom": row.uom,
				"rate": row.rate,
				"warehouse": warehouse,
				"cost_center": cost_center,
				"project": project,
			},
		)
	pr.flags.ignore_permissions = True
	pr.insert()
	pr.submit()
	frappe.db.set_value("Farm Purchase", doc.name, "purchase_receipt", pr.name)

	# Purchase Invoice
	from erpnext.stock.doctype.purchase_receipt.purchase_receipt import make_purchase_invoice

	pi = make_purchase_invoice(pr.name)
	pi.due_date = doc.purchase_date
	pi.flags.ignore_permissions = True
	pi.insert()
	pi.submit()
	frappe.db.set_value("Farm Purchase", doc.name, "purchase_invoice", pi.name)

	# Auto-create medicine lots
	if doc.purchase_type == "Medicine":
		for row in doc.items:
			if not row.lot_number:
				continue
			if frappe.db.exists("Medicine Lot", {"medicine_item": row.item, "lot_number": row.lot_number}):
				continue
			lot = frappe.new_doc("Medicine Lot")
			lot.medicine_item = row.item
			lot.lot_number = row.lot_number
			lot.received_date = doc.purchase_date
			lot.expiry_date = row.expiry_date
			lot.supplier = doc.supplier
			lot.invoice_ref = pi.name
			lot.quantity_received = row.qty
			lot.quantity_remaining = row.qty
			lot.uom = row.uom
			lot.flags.ignore_permissions = True
			lot.insert()


def on_purchase_cancel(doc, method=None):
	"""Cancellation must be done via ERPNext docs to keep ledger consistent."""
	frappe.msgprint("Please cancel the linked Purchase Receipt and Purchase Invoice manually to maintain ledger integrity.", alert=True)
