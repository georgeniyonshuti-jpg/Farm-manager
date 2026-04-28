app_name = "farm_manager"
app_title = "Farm Manager"
app_publisher = "Farm Manager"
app_description = "Native ERPNext app for poultry / farm operations"
app_email = "admin@farmmanager.local"
app_license = "MIT"

required_apps = ["frappe", "erpnext"]

add_to_apps_screen = [
	{
		"name": app_name,
		"logo": "/assets/farm_manager/images/farm_manager_logo.svg",
		"title": app_title,
		"route": "/app/farm-manager",
	}
]

# Built by esbuild: see farm_manager/public/js/farm_manager.bundle.js
app_include_css = "farm_manager.bundle.css"
app_include_js = "farm_manager.bundle.js"

after_install = "farm_manager.install.after_install"
after_migrate = ["farm_manager.install.after_migrate"]

# ---------------------------------------------------------------------------
# Document Events
# ---------------------------------------------------------------------------
doc_events = {
	"Flock Daily Log": {
		"on_submit": "farm_manager.stock.feed_consumption.on_daily_log_submit",
		"on_cancel": "farm_manager.stock.feed_consumption.on_daily_log_cancel",
		"validate": "farm_manager.farm_manager.doctype.flock_daily_log.flock_daily_log.validate_high_mortality",
	},
	"Flock Feed Entry": {
		"on_submit": "farm_manager.stock.feed_consumption.on_feed_entry_submit",
		"on_cancel": "farm_manager.stock.feed_consumption.on_feed_entry_cancel",
	},
	"Treatment Round Event": {
		"on_submit": "farm_manager.stock.medicine_consumption.on_round_event_submit",
	},
	"Mortality Event": {
		"on_submit": "farm_manager.accounting.posting.on_mortality_submit",
	},
	"Slaughter Event": {
		"on_submit": "farm_manager.accounting.posting.on_slaughter_submit",
	},
	"Poultry Sales Order": {
		"on_submit": "farm_manager.sales.poultry_sales.on_sales_order_submit",
		"on_cancel": "farm_manager.sales.poultry_sales.on_sales_order_cancel",
	},
	"Farm Purchase": {
		"on_submit": "farm_manager.buying.poultry_buying.on_purchase_submit",
		"on_cancel": "farm_manager.buying.poultry_buying.on_purchase_cancel",
	},
	"Flock": {
		"after_insert": "farm_manager.projects.flock_project.create_project_for_flock",
		"on_update": "farm_manager.projects.flock_project.sync_project_status",
	},
	"Salary Slip": {
		"on_submit": "farm_manager.payroll.flock_allocation.allocate_salary_to_flocks",
	},
}

# ---------------------------------------------------------------------------
# Scheduled Tasks
# ---------------------------------------------------------------------------
scheduler_events = {
	"daily": [
		"farm_manager.farm_manager.doctype.flock.flock.daily_age_recalc",
		"farm_manager.farm_manager.doctype.flock_log_schedule.flock_log_schedule.create_daily_log_reminders",
		"farm_manager.farm_manager.doctype.flock.flock.update_flock_snapshots",
	],
	"hourly": [
		"farm_manager.farm_manager.doctype.treatment_round.treatment_round.flag_missed_rounds",
	],
	"cron": {
		"0 2 * * *": [
			"farm_manager.accounting.posting.run_nightly_revaluation",
		]
	},
}

# ---------------------------------------------------------------------------
# Permissions / has_permission
# ---------------------------------------------------------------------------
has_permission = {
	"Flock": "farm_manager.utils.permissions.flock_has_permission",
	"Flock Daily Log": "farm_manager.utils.permissions.flock_child_has_permission",
}

# ---------------------------------------------------------------------------
# Override Doctype Class
# ---------------------------------------------------------------------------
override_doctype_class = {}

# ---------------------------------------------------------------------------
# Fixtures (custom fields on ERPNext core doctypes)
# ---------------------------------------------------------------------------
fixtures = [
	{
		"dt": "Custom Field",
		"filters": [["module", "=", "Farm Manager"]],
	},
	{
		"dt": "Property Setter",
		"filters": [["module", "=", "Farm Manager"]],
	},
	{
		"dt": "Role",
		"filters": [["name", "in", [
			"Farm Manager",
			"Farm Owner",
			"Farm Veterinarian",
			"Farm Laborer",
			"Farm Accountant",
		]]],
	},
]

# ---------------------------------------------------------------------------
# Boot Session
# ---------------------------------------------------------------------------
boot_session = "farm_manager.boot.boot_session"

# ---------------------------------------------------------------------------
# Whitelisted Methods (REST API)
# ---------------------------------------------------------------------------
override_whitelisted_methods = {}

# ---------------------------------------------------------------------------
# Standard Portal Menu
# ---------------------------------------------------------------------------
standard_portal_menu_items = [
	{
		"title": "Farm Operations",
		"route": "/farm-operations",
		"role": "Farm Manager",
	},
]
