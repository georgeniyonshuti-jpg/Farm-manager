"""Cutover helpers used during parallel run and rollback windows."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import frappe


SNAPSHOT_DIR = Path("/var/log/farm_manager/cutover")


def snapshot_new_records(since: str | None = None, dest: Path | None = None) -> Path:
	"""Dump every Farm Manager doc created since `since` to a JSONL file for replay."""
	dest = dest or SNAPSHOT_DIR
	dest.mkdir(parents=True, exist_ok=True)
	since = since or frappe.utils.add_days(frappe.utils.nowdate(), -1)
	out_file = dest / f"snapshot-{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}.jsonl"
	doctypes = [
		"Flock",
		"Flock Daily Log",
		"Flock Feed Entry",
		"Flock Weigh-in",
		"Mortality Event",
		"Slaughter Event",
		"Treatment Round",
		"Treatment Round Event",
		"Health Record",
		"Prescription",
		"Poultry Sales Order",
		"Farm Purchase",
	]
	with out_file.open("w") as f:
		for dt in doctypes:
			rows = frappe.get_all(
				dt,
				filters={"creation": (">=", since)},
				pluck="name",
			)
			for name in rows:
				doc = frappe.get_doc(dt, name)
				f.write(json.dumps({"doctype": dt, "data": doc.as_dict()}, default=str) + "\n")
	return out_file


def freeze_writes(reason: str = "cutover"):
	"""Set a flag in System Settings to prevent non-admin writes during cutover."""
	frappe.db.set_single_value("System Settings", "disable_user_pass_login", 0)
	frappe.cache().set_value("farm_manager:freeze", reason)


def unfreeze_writes():
	frappe.cache().delete_value("farm_manager:freeze")


def is_frozen() -> bool:
	return bool(frappe.cache().get_value("farm_manager:freeze"))
