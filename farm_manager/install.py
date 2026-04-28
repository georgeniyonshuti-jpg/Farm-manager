"""Install / migrate hooks for Farm Manager."""
import frappe


DEFAULT_ROLES = [
	"Farm Manager",
	"Farm Owner",
	"Farm Veterinarian",
	"Farm Laborer",
	"Farm Accountant",
]

DEFAULT_ITEM_GROUPS = [
	{"item_group_name": "Feed", "is_group": 0},
	{"item_group_name": "Medicine", "is_group": 0},
	{"item_group_name": "Live Birds", "is_group": 0},
	{"item_group_name": "Eggs", "is_group": 0},
	{"item_group_name": "Carcass / Slaughter", "is_group": 0},
]


def after_install():
	create_roles()
	create_item_groups()
	create_default_uoms()
	frappe.db.commit()


def after_migrate():
	create_roles()
	create_item_groups()
	create_default_uoms()


def create_roles():
	for role_name in DEFAULT_ROLES:
		if not frappe.db.exists("Role", role_name):
			role = frappe.new_doc("Role")
			role.role_name = role_name
			role.desk_access = 1
			role.insert(ignore_permissions=True, ignore_if_duplicate=True)


def create_item_groups():
	for group in DEFAULT_ITEM_GROUPS:
		if not frappe.db.exists("Item Group", group["item_group_name"]):
			doc = frappe.new_doc("Item Group")
			doc.item_group_name = group["item_group_name"]
			doc.is_group = group["is_group"]
			parent = frappe.db.get_value(
				"Item Group", {"is_group": 1, "name": "All Item Groups"}, "name"
			)
			if parent:
				doc.parent_item_group = parent
			doc.insert(ignore_permissions=True, ignore_if_duplicate=True)


def create_default_uoms():
	uoms = ["Bird", "Dose", "Sachet", "ml", "Litre"]
	for uom in uoms:
		if not frappe.db.exists("UOM", uom):
			doc = frappe.new_doc("UOM")
			doc.uom_name = uom
			doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
