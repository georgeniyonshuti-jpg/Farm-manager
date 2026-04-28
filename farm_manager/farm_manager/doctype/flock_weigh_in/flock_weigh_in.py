import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class FlockWeighin(Document):
	def validate(self):
		if not self.avg_weight_kg or self.avg_weight_kg <= 0:
			frappe.throw(_("Average weight must be greater than zero"))
		if not self.sample_size or self.sample_size <= 0:
			frappe.throw(_("Sample size must be greater than zero"))
		self.compute_fcr()
		self.compute_variance()

	def compute_fcr(self):
		try:
			denom = flt(self.avg_weight_kg) * flt(self.sample_size)
			if denom > 0:
				self.fcr = round(flt(self.total_feed_used_kg) / denom, 2)
			else:
				self.fcr = None
		except Exception:
			self.fcr = None

	def compute_variance(self):
		if not self.target_weight_kg:
			target = frappe.db.get_value("Flock", self.flock, "target_weight_kg") or 0
			self.target_weight_kg = target
		if self.target_weight_kg and self.avg_weight_kg:
			self.variance_pct = round(
				((flt(self.avg_weight_kg) - flt(self.target_weight_kg)) / flt(self.target_weight_kg)) * 100,
				1,
			)
		else:
			self.variance_pct = None

	def on_update(self):
		flock = frappe.get_doc("Flock", self.flock)
		flock.current_avg_weight_kg = self.avg_weight_kg
		flock.compute_running_metrics()
		flock.db_update()
