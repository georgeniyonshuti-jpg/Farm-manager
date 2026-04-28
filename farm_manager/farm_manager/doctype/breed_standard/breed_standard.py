import json

import frappe
from frappe.model.document import Document


class BreedStandard(Document):
	def validate(self):
		if self.growth_curve_json:
			try:
				data = json.loads(self.growth_curve_json)
				if not isinstance(data, list):
					frappe.throw("Growth curve JSON must be a list")
			except json.JSONDecodeError as e:
				frappe.throw(f"Invalid growth curve JSON: {e}")
