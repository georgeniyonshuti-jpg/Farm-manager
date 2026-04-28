frappe.ui.form.on("Flock", {
	refresh(frm) {
		frm.trigger("set_house_query");

		if (!frm.is_new() && frm.doc.status === "Active") {
			frm.add_custom_button(__("Daily Log"), () => {
				frappe.new_doc("Flock Daily Log", { flock: frm.doc.name });
			}, __("Create"));
			frm.add_custom_button(__("Weigh-in"), () => {
				frappe.new_doc("Flock Weigh-in", { flock: frm.doc.name });
			}, __("Create"));
			frm.add_custom_button(__("Treatment Round"), () => {
				frappe.new_doc("Treatment Round", { flock: frm.doc.name });
			}, __("Create"));
			frm.add_custom_button(__("Sales Order"), () => {
				frappe.new_doc("Poultry Sales Order", { flock: frm.doc.name });
			}, __("Create"));
		}
		if (!frm.is_new() && frm.doc.project) {
			frm.add_custom_button(__("Project"), () => {
				frappe.set_route("Form", "Project", frm.doc.project);
			}, __("View"));
		}

		if (frm.is_new()) {
			frm.add_custom_button(__("Create Barn"), () => {
				const doc = {
					farm: frm.doc.farm || undefined,
				};
				frappe.new_doc("Farm House", doc);
			}, __("Create"));
		}
	},
	farm(frm) {
		frm.trigger("set_house_query");

		if (frm.doc.farm) {
			frappe.db.get_value("Farm", frm.doc.farm, ["default_cost_center", "default_warehouse"]).then(r => {
				if (r.message) {
					if (!frm.doc.cost_center) frm.set_value("cost_center", r.message.default_cost_center);
					if (!frm.doc.warehouse) frm.set_value("warehouse", r.message.default_warehouse);
				}
			});
		}

		if (frm.doc.house) {
			frm.set_value("house", null);
		}
	},
	set_house_query(frm) {
		frm.set_query("house", () => {
			if (!frm.doc.farm) {
				return {
					filters: {
						is_active: 1,
					},
				};
			}

			return {
				filters: {
					farm: frm.doc.farm,
					is_active: 1,
				},
			};
		});
	},
});
