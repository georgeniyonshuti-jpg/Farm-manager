"""Flock controller. Central document for poultry lifecycle."""
from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import date_diff, flt, getdate, nowdate

from farm_manager.utils.erpnext_links import (
	get_or_create_cost_center,
	get_or_create_item,
	get_or_create_warehouse,
)


class Flock(Document):
	def autoname(self):
		from frappe.model.naming import set_name_by_naming_series

		set_name_by_naming_series(self)
		if not self.flock_code:
			self.flock_code = self.name

	def validate(self):
		self.compute_age()
		self.compute_running_metrics()
		if self.initial_count is not None and self.initial_count <= 0:
			frappe.throw(_("Initial count must be greater than zero"))
		if self.harvest_date and self.placement_date:
			if getdate(self.harvest_date) < getdate(self.placement_date):
				frappe.throw(_("Harvest date cannot be before placement date"))

	def before_insert(self):
		self.ensure_links()
		self.current_count = self.initial_count or 0
		self.mortality_total = 0
		self.feed_consumed_kg = 0
		if self.unit_cost_per_chick and self.initial_count:
			self.total_placement_cost = flt(self.unit_cost_per_chick) * flt(self.initial_count)

	def ensure_links(self):
		"""Auto-create supporting ERPNext records if not provided."""
		company = frappe.db.get_value("Farm", self.farm, "company")
		if not self.cost_center and company:
			cc_name = f"FLOCK-{self.flock_code or self.name}"
			self.cost_center = get_or_create_cost_center(cc_name, company)
		if not self.warehouse and company:
			warehouse_name = f"FLOCK-{self.flock_code or self.name}"
			self.warehouse = get_or_create_warehouse(warehouse_name, company)
		if not self.live_bird_item:
			breed = self.breed_code or self.breed_standard or "Generic"
			self.live_bird_item = get_or_create_item(
				item_code=f"BIRD-{breed}-{self.flock_code or self.name}",
				item_name=f"Live Birds - {breed} - {self.flock_code or self.name}",
				item_group="Live Birds",
				stock_uom="Nos",
			)

	def compute_age(self):
		if self.placement_date:
			end = getdate(self.harvest_date or nowdate())
			self.age_days = max(0, date_diff(end, getdate(self.placement_date)))

	def compute_running_metrics(self):
		mortality = (
			frappe.db.sql(
				"""SELECT COALESCE(SUM(mortality), 0) FROM `tabFlock Daily Log`
				WHERE flock = %s AND docstatus = 1""",
				self.name,
			)[0][0]
			or 0
		)
		feed = (
			frappe.db.sql(
				"""SELECT COALESCE(SUM(feed_intake_kg), 0) FROM `tabFlock Daily Log`
				WHERE flock = %s AND docstatus = 1""",
				self.name,
			)[0][0]
			or 0
		)
		self.mortality_total = mortality
		self.feed_consumed_kg = feed
		self.current_count = max((self.initial_count or 0) - mortality, 0)
		if self.initial_count:
			self.mortality_pct = (mortality / self.initial_count) * 100
		else:
			self.mortality_pct = 0

		if self.current_avg_weight_kg and self.current_count:
			live_weight = flt(self.current_avg_weight_kg) * flt(self.current_count)
			if live_weight > 0:
				self.fcr_running = round(flt(feed) / live_weight, 2)


@frappe.whitelist()
def daily_age_recalc():
	for flock in frappe.get_all(
		"Flock",
		filters={"status": ("in", ["Planned", "Active"])},
		pluck="name",
	):
		doc = frappe.get_doc("Flock", flock)
		doc.compute_age()
		doc.compute_running_metrics()
		doc.db_update()


@frappe.whitelist()
def update_flock_snapshots():
	"""Daily snapshot of every active flock for trend analytics."""
	today = nowdate()
	for flock_name in frappe.get_all(
		"Flock",
		filters={"status": "Active"},
		pluck="name",
	):
		flock = frappe.get_doc("Flock", flock_name)
		exists = frappe.db.exists(
			"Flock Snapshot", {"flock": flock_name, "snapshot_date": today}
		)
		if exists:
			continue
		snap = frappe.new_doc("Flock Snapshot")
		snap.flock = flock_name
		snap.snapshot_date = today
		snap.age_days = flock.age_days
		snap.current_count = flock.current_count
		snap.mortality_total = flock.mortality_total
		snap.mortality_pct = flock.mortality_pct
		snap.feed_consumed_kg = flock.feed_consumed_kg
		snap.fcr_running = flock.fcr_running
		snap.current_avg_weight_kg = flock.current_avg_weight_kg
		snap.current_valuation = flock.current_valuation
		snap.insert(ignore_permissions=True)
