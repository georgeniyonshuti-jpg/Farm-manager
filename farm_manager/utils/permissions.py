"""Permission helpers."""
import frappe


def flock_has_permission(doc, ptype, user):
	"""Restrict flock visibility to assigned farm operators."""
	if user == "Administrator":
		return True

	roles = set(frappe.get_roles(user))
	privileged = {"System Manager", "Farm Manager", "Farm Owner", "Farm Accountant"}
	if roles & privileged:
		return True

	if "Farm Veterinarian" in roles:
		return True

	if "Farm Laborer" in roles:
		assigned = frappe.db.get_value(
			"Flock", doc.name, "assigned_laborer"
		)
		if assigned == user:
			return True
		return False

	return None


def flock_child_has_permission(doc, ptype, user):
	flock = getattr(doc, "flock", None)
	if not flock:
		return None
	return flock_has_permission(
		frappe.get_doc("Flock", flock), ptype, user
	)
