"""Translate Poultry Sales Order into ERPNext Sales Order + Delivery Note + Sales Invoice."""
from __future__ import annotations

import frappe
from frappe.utils import flt

from farm_manager.utils.erpnext_links import get_or_create_customer


def on_sales_order_submit(doc, method=None):
	flock = frappe.get_doc("Flock", doc.flock)
	customer = doc.customer or get_or_create_customer(doc.buyer_name, doc.buyer_contact)
	frappe.db.set_value("Poultry Sales Order", doc.name, "customer", customer)

	# Sales Order
	so = frappe.new_doc("Sales Order")
	so.customer = customer
	so.delivery_date = doc.order_date
	so.transaction_date = doc.order_date
	so.cost_center = flock.cost_center
	so.project = flock.project
	so.append(
		"items",
		{
			"item_code": flock.live_bird_item,
			"qty": doc.total_weight_kg,
			"uom": "Kg",
			"rate": doc.price_per_kg,
			"warehouse": flock.warehouse,
			"cost_center": flock.cost_center,
			"project": flock.project,
		},
	)
	so.flags.ignore_permissions = True
	so.insert()
	so.submit()
	frappe.db.set_value("Poultry Sales Order", doc.name, "sales_order", so.name)

	# Delivery Note (auto from SO)
	from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note

	dn = make_delivery_note(so.name)
	dn.posting_date = doc.order_date
	dn.flags.ignore_permissions = True
	dn.insert()
	dn.submit()
	frappe.db.set_value("Poultry Sales Order", doc.name, "delivery_note", dn.name)

	# Sales Invoice
	from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice

	si = make_sales_invoice(so.name)
	si.due_date = doc.order_date
	si.flags.ignore_permissions = True
	si.insert()
	si.submit()
	frappe.db.set_value("Poultry Sales Order", doc.name, "sales_invoice", si.name)

	# Update flock current count
	new_count = max((flock.current_count or 0) - (doc.number_of_birds or 0), 0)
	frappe.db.set_value("Flock", doc.flock, "current_count", new_count)
	if new_count == 0:
		frappe.db.set_value("Flock", doc.flock, "status", "Harvested")
		frappe.db.set_value("Flock", doc.flock, "harvest_date", doc.order_date)


def on_sales_order_cancel(doc, method=None):
	for f in ("sales_invoice", "delivery_note", "sales_order"):
		ref = doc.get(f)
		if ref and frappe.db.get_value(f.replace("_", " ").title().replace("Po Order", "Sales Order"), ref, "docstatus") == 1:
			pass  # users should cancel ERPNext docs manually to keep accounting integrity
