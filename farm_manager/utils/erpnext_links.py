"""Helpers for resolving Farm Manager docs to ERPNext core entities."""
import frappe


def get_or_create_item(item_code: str, item_name: str, item_group: str, stock_uom: str = "Kg"):
	if frappe.db.exists("Item", item_code):
		return item_code
	doc = frappe.new_doc("Item")
	doc.item_code = item_code
	doc.item_name = item_name
	doc.item_group = item_group
	doc.stock_uom = stock_uom
	doc.is_stock_item = 1
	doc.has_batch_no = 1 if item_group == "Medicine" else 0
	doc.has_expiry_date = 1 if item_group in ("Medicine", "Feed") else 0
	doc.insert(ignore_permissions=True)
	return doc.name


def get_or_create_customer(buyer_name: str, contact: str | None = None):
	if not buyer_name:
		buyer_name = "Walk-in Buyer"
	if frappe.db.exists("Customer", buyer_name):
		return buyer_name
	doc = frappe.new_doc("Customer")
	doc.customer_name = buyer_name
	doc.customer_type = "Individual"
	doc.customer_group = (
		frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
		or "All Customer Groups"
	)
	doc.territory = (
		frappe.db.get_value("Territory", {"is_group": 0}, "name")
		or "All Territories"
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def get_or_create_supplier(supplier_name: str):
	if not supplier_name:
		return None
	if frappe.db.exists("Supplier", supplier_name):
		return supplier_name
	doc = frappe.new_doc("Supplier")
	doc.supplier_name = supplier_name
	doc.supplier_group = (
		frappe.db.get_value("Supplier Group", {"is_group": 0}, "name")
		or "All Supplier Groups"
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def get_or_create_warehouse(warehouse_name: str, company: str | None = None):
	company = company or frappe.defaults.get_user_default("Company")
	if not company:
		return None
	full_name = f"{warehouse_name} - {frappe.db.get_value('Company', company, 'abbr')}"
	if frappe.db.exists("Warehouse", full_name):
		return full_name
	doc = frappe.new_doc("Warehouse")
	doc.warehouse_name = warehouse_name
	doc.company = company
	doc.insert(ignore_permissions=True)
	return doc.name


def get_or_create_cost_center(cc_name: str, company: str | None = None):
	company = company or frappe.defaults.get_user_default("Company")
	if not company:
		return None
	full_name = f"{cc_name} - {frappe.db.get_value('Company', company, 'abbr')}"
	if frappe.db.exists("Cost Center", full_name):
		return full_name
	parent = frappe.db.get_value(
		"Cost Center", {"is_group": 1, "company": company}, "name"
	)
	doc = frappe.new_doc("Cost Center")
	doc.cost_center_name = cc_name
	doc.company = company
	doc.parent_cost_center = parent
	doc.insert(ignore_permissions=True)
	return doc.name
