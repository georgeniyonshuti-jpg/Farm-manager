from frappe.model.document import Document


CHECKS = [
	"fence_intact",
	"footbath_clean",
	"rodent_control",
	"visitor_log",
	"isolation_unit",
	"biosecurity_signage",
	"feed_stored_dry",
	"ppe_available",
]


class BiosecurityAudit(Document):
	def validate(self):
		passed = sum(1 for c in CHECKS if self.get(c))
		self.score = int((passed / len(CHECKS)) * 100)
		if self.score >= 90:
			self.result = "Pass"
		elif self.score >= 70:
			self.result = "Conditional Pass"
		else:
			self.result = "Fail"
