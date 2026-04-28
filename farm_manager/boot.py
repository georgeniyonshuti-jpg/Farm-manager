"""Boot session additions."""
import frappe


def boot_session(bootinfo):
	"""Inject Farm Manager specific boot info."""
	bootinfo["farm_manager"] = {
		"version": frappe.get_attr("farm_manager.__version__"),
		"default_warehouse": frappe.db.get_single_value(
			"Farm Manager Settings", "default_warehouse"
		)
		if frappe.db.exists("DocType", "Farm Manager Settings")
		else None,
	}
