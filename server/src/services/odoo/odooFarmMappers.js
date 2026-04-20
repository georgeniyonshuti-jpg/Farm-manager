/**
 * Farm-to-Odoo payload mappers.
 * Each function takes a plain DB-sourced record and returns the shape
 * expected by odooAccounting.js draft-first functions.
 *
 * All mappers are pure (no async/DB calls) so they can be unit tested easily.
 *
 * Account codes come from FARM_ACCOUNT_DEFS in odooSetup.js.
 * odooAccounting.js resolves them to Odoo account IDs at dispatch time.
 * If an account with that code doesn't exist in Odoo, the dispatch will fail
 * with a clear error that shows up in the Needs Action queue.
 * Use the Odoo Setup page to create all farm accounts first.
 */

// Account codes — mirror FARM_ACCOUNT_DEFS.code values in odooSetup.js
const ACC = {
  bio_assets: "101001",
  meat_inventory: "101002",
  feed_inventory: "101003",
  medicine_inventory: "101004",
  meat_sales_revenue: "401001",
  bio_asset_gain: "401002",
  harvest_gain: "401003",
  feed_expense: "601001",
  medicine_expense: "601002",
  wage_expense: "601003",
  mortality_loss: "601004",
  harvest_loss: "601005",
  bio_asset_loss: "601006",
  wages_payable: "201001",
};

/**
 * Maps a feed procurement row to a vendor bill payload.
 * @param {{ id: string, feedType: string|null, quantityKg: number, unitCostRwfPerKg: number|null, supplierName: string|null, at: string }} row
 */
export function mapFeedProcurementToBill(row) {
  const description = [
    "Feed purchase",
    row.feedType ? `— ${String(row.feedType).replace(/_/g, " ")}` : "",
    `(${Number(row.quantityKg).toFixed(1)} kg)`,
  ].filter(Boolean).join(" ");

  return {
    vendorName: row.supplierName || "Feed Supplier",
    vendorEmail: null,
    date: String(row.at ?? "").slice(0, 10),
    externalRef: `FM-FEED-${row.id}`,
    lines: [
      {
        description,
        quantity: Number(row.quantityKg),
        unitPrice: Number(row.unitCostRwfPerKg ?? 0),
        accountCode: ACC.feed_expense,
      },
    ],
  };
}

/**
 * Maps a medicine lot receipt to a vendor bill payload.
 * @param {{ id: string, medicineName: string, lotNumber: string, quantityReceived: number, unitCostRwf: number|null, supplier: string|null, receivedAt: string }} lot
 */
export function mapMedicineLotToBill(lot) {
  return {
    vendorName: lot.supplier || "Veterinary Supplier",
    vendorEmail: null,
    date: String(lot.receivedAt ?? "").slice(0, 10),
    externalRef: `FM-MED-${lot.id}`,
    lines: [
      {
        description: `${lot.medicineName || "Medicine"} — Lot ${lot.lotNumber || "unknown"} (${Number(lot.quantityReceived)} units)`,
        quantity: Number(lot.quantityReceived),
        unitPrice: Number(lot.unitCostRwf ?? 0),
        accountCode: ACC.medicine_expense,
      },
    ],
  };
}

/**
 * Maps a slaughter event to a biological-asset -> meat-inventory conversion journal entry.
 * Under IAS 41, biological assets are derecognised at slaughter and recognised as
 * agricultural produce (meat inventory) at fair value less costs to sell at point of harvest.
 *
 * Journal:
 *   DR  Meat Inventory (asset)           = fair value
 *   CR  Biological Assets – Live Birds   = carrying amount
 *   DR/CR  Gain/Loss on Harvest          = difference (fair value – carrying amount)
 *
 * Account codes are looked up from accounting_event_configs at runtime if not provided.
 *
 * @param {{ id: string, flockId: string, flockCode: string|null, birdsSlaughtered: number, avgLiveWeightKg: number, avgCarcassWeightKg: number|null, fairValueRwf: number|null, at: string }} event
 * @param {{ carryingValueRwf?: number }} [opts]
 */
export function mapSlaughterToJournalEntry(event, opts = {}) {
  const fairValue = Number(event.fairValueRwf ?? 0);
  const carryingValue = Number(opts.carryingValueRwf ?? fairValue);
  const harvestGainLoss = fairValue - carryingValue;
  const flockLabel = event.flockCode || event.flockId || "unknown flock";
  const date = String(event.at ?? "").slice(0, 10);
  const ref = `FM-SLH-${event.id}`;

  const lines = [
    {
      accountCode: ACC.meat_inventory,
      label: `Meat stock from slaughter — ${flockLabel} (${event.birdsSlaughtered} birds)`,
      debit: fairValue,
      credit: 0,
    },
    {
      accountCode: ACC.bio_assets,
      label: `Derecognise live birds — ${flockLabel}`,
      debit: 0,
      credit: carryingValue,
    },
  ];

  if (Math.abs(harvestGainLoss) > 0.01) {
    if (harvestGainLoss > 0) {
      lines.push({
        accountCode: ACC.harvest_gain,
        label: `Gain on harvest — ${flockLabel}`,
        debit: 0,
        credit: harvestGainLoss,
      });
    } else {
      lines.push({
        accountCode: ACC.harvest_loss,
        label: `Loss on harvest — ${flockLabel}`,
        debit: Math.abs(harvestGainLoss),
        credit: 0,
      });
    }
  }

  return { ref, date, lines, externalRef: ref };
}

/**
 * Maps a sales order to a customer invoice payload.
 * @param {{ id: string, flockId: string, orderDate: string, numberOfBirds: number, totalWeightKg: number, pricePerKg: number, buyerName: string|null, buyerEmail: string|null, buyerContact: string|null }} order
 */
export function mapSaleOrderToInvoice(order) {
  const totalValue = Number(order.totalWeightKg) * Number(order.pricePerKg);
  return {
    partnerName: order.buyerName || "Farm Customer",
    partnerEmail: order.buyerEmail || null,
    date: String(order.orderDate ?? "").slice(0, 10),
    externalRef: `FM-SAL-${order.id}`,
    lines: [
      {
        productName: "Broiler — Processed Meat",
        quantity: Number(order.totalWeightKg),
        unitPrice: Number(order.pricePerKg),
        description: `${order.numberOfBirds} birds @ ${Number(order.pricePerKg).toFixed(2)} RWF/kg`,
      },
    ],
    totalValue,
  };
}

/**
 * Maps a payroll period closure to a wage expense journal entry.
 * Journal (simplified):
 *   DR  Wage Expense (P&L)         = net_payroll_rwf
 *   CR  Wages Payable (liability)  = net_payroll_rwf
 *
 * @param {{ id: string, periodStart: string, periodEnd: string, netPayrollRwf: number, totalCreditsRwf: number, totalDeductionsRwf: number, workerCount: number }} closure
 */
export function mapPayrollClosureToJournalEntry(closure) {
  const net = Math.abs(Number(closure.netPayrollRwf ?? 0));
  if (net < 0.01) return null;
  const ref = `FM-PAY-${closure.id}`;
  const date = String(closure.periodEnd ?? "").slice(0, 10);
  const label = `Field laborer wages — period ${closure.periodStart} to ${closure.periodEnd} (${closure.workerCount} workers)`;

  return {
    ref,
    date,
    externalRef: ref,
    lines: [
      {
        accountCode: ACC.wage_expense,
        label,
        debit: net,
        credit: 0,
      },
      {
        accountCode: ACC.wages_payable,
        label: `Wages payable — ${closure.periodStart} to ${closure.periodEnd}`,
        debit: 0,
        credit: net,
      },
    ],
  };
}

/**
 * Maps a flock opening (chick purchase) to a vendor bill (biological asset recognition).
 * @param {{ id: string, code: string|null, purchaseCostRwf: number, initialCount: number, purchaseSupplier: string|null, purchaseDate: string|null, createdAt: string }} flock
 */
export function mapFlockOpeningToBill(flock) {
  const totalCost = Number(flock.purchaseCostRwf ?? 0);
  const costPerChick = flock.initialCount > 0 ? totalCost / flock.initialCount : 0;
  const date = String(flock.purchaseDate ?? flock.createdAt ?? "").slice(0, 10);
  const ref = `FM-FOPEN-${flock.id}`;
  return {
    vendorName: flock.purchaseSupplier || "Chick Supplier",
    vendorEmail: null,
    date,
    externalRef: ref,
    lines: [
      {
        description: `Live chick purchase — Flock ${flock.code || flock.id} (${flock.initialCount} birds @ ${costPerChick.toFixed(0)} RWF each)`,
        quantity: Number(flock.initialCount ?? 1),
        unitPrice: costPerChick,
        accountCode: ACC.bio_assets,
      },
    ],
  };
}

/**
 * Maps a mortality event to an IAS 41 impairment loss journal entry.
 * Journal:
 *   DR  Impairment Loss on Biological Assets (P&L)
 *   CR  Biological Assets — Live Birds
 *
 * @param {{ id: string, flockId: string, flockCode: string|null, impairmentValueRwf: number, count: number, at: string }} event
 */
export function mapMortalityToImpairmentEntry(event) {
  const loss = Math.abs(Number(event.impairmentValueRwf ?? 0));
  if (loss < 0.01) return null;
  const ref = `FM-MORT-${event.id}`;
  const date = String(event.at ?? "").slice(0, 10);
  const flockLabel = event.flockCode || event.flockId;

  return {
    ref,
    date,
    externalRef: ref,
    lines: [
      {
        accountCode: ACC.mortality_loss,
        label: `Mortality impairment — ${flockLabel} (${event.count} birds, IAS 41)`,
        debit: loss,
        credit: 0,
      },
      {
        accountCode: ACC.bio_assets,
        label: `Derecognise dead birds — ${flockLabel}`,
        debit: 0,
        credit: loss,
      },
    ],
  };
}

/**
 * Maps a feed write-off (damage/loss adjustment) to a P&L expense entry.
 * @param {{ id: string, deltaKg: number, unitCostRwfPerKg: number|null, reason: string, at: string }} row
 */
export function mapFeedWriteOffToJournalEntry(row) {
  const lossKg = Math.abs(Number(row.deltaKg ?? 0));
  const costPerKg = Number(row.unitCostRwfPerKg ?? 0);
  const totalLoss = lossKg * costPerKg;
  if (totalLoss < 0.01) return null;
  const ref = `FM-WOFF-${row.id}`;
  const date = String(row.at ?? "").slice(0, 10);

  return {
    ref,
    date,
    externalRef: ref,
    lines: [
      {
        accountCode: ACC.feed_expense,
        label: `Feed write-off — ${row.reason || "damage/loss"} (${lossKg.toFixed(0)} kg)`,
        debit: totalLoss,
        credit: 0,
      },
      {
        accountCode: ACC.feed_inventory,
        label: `Feed inventory reduction — ${row.reason || "write-off"}`,
        debit: 0,
        credit: totalLoss,
      },
    ],
  };
}

/**
 * Maps a flock valuation snapshot to a fair-value adjustment journal entry (IAS 41).
 * Journal:
 *   If fair value increased:
 *     DR  Biological Assets – Live Birds
 *     CR  Gain from Change in Fair Value (P&L)
 *   If fair value decreased:
 *     DR  Loss from Change in Fair Value (P&L)
 *     CR  Biological Assets – Live Birds
 *
 * @param {{ id: string, flockId: string, snapshotDate: string, fairValueChangeRwf: number, totalFairValueRwf: number, flockCode?: string }} snapshot
 */
export function mapValuationSnapshotToJournalEntry(snapshot) {
  const change = Number(snapshot.fairValueChangeRwf ?? 0);
  if (Math.abs(change) < 0.01) return null;

  const flockLabel = snapshot.flockCode || snapshot.flockId;
  const ref = `FM-VAL-${snapshot.id}`;
  const date = String(snapshot.snapshotDate ?? "").slice(0, 10);

  let lines;
  if (change > 0) {
    lines = [
      {
        accountCode: ACC.bio_assets,
        label: `Fair value increase — ${flockLabel}`,
        debit: change,
        credit: 0,
      },
      {
        accountCode: ACC.bio_asset_gain,
        label: `Gain on biological asset revaluation — ${flockLabel}`,
        debit: 0,
        credit: change,
      },
    ];
  } else {
    const absChange = Math.abs(change);
    lines = [
      {
        accountCode: ACC.bio_asset_loss,
        label: `Loss on biological asset revaluation — ${flockLabel}`,
        debit: absChange,
        credit: 0,
      },
      {
        accountCode: ACC.bio_assets,
        label: `Fair value decrease — ${flockLabel}`,
        debit: 0,
        credit: absChange,
      },
    ];
  }

  return { ref, date, lines, externalRef: ref };
}
