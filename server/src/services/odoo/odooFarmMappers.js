/**
 * Farm-to-Odoo payload mappers.
 * Each function takes a plain DB-sourced record and returns the shape
 * expected by odooAccounting.js draft-first functions.
 *
 * All mappers are pure (no async/DB calls) so they can be unit tested easily.
 */

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
        accountCode: null, // resolved from accounting_event_configs or defaults
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
        accountCode: null,
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
      accountCode: null, // Meat Inventory — resolved at runtime
      label: `Meat stock from slaughter — ${flockLabel} (${event.birdsSlaughtered} birds)`,
      debit: fairValue,
      credit: 0,
    },
    {
      accountCode: null, // Biological Assets — resolved at runtime
      label: `Derecognise live birds — ${flockLabel}`,
      debit: 0,
      credit: carryingValue,
    },
  ];

  if (Math.abs(harvestGainLoss) > 0.01) {
    if (harvestGainLoss > 0) {
      lines.push({
        accountCode: null, // Gain on harvest — resolved at runtime
        label: `Gain on harvest — ${flockLabel}`,
        debit: 0,
        credit: harvestGainLoss,
      });
    } else {
      lines.push({
        accountCode: null, // Loss on harvest — resolved at runtime
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
        accountCode: null, // Biological Assets — resolved at runtime
        label: `Fair value increase — ${flockLabel}`,
        debit: change,
        credit: 0,
      },
      {
        accountCode: null, // Gain from fair value change — resolved at runtime
        label: `Gain on biological asset revaluation — ${flockLabel}`,
        debit: 0,
        credit: change,
      },
    ];
  } else {
    const absChange = Math.abs(change);
    lines = [
      {
        accountCode: null, // Loss from fair value change — resolved at runtime
        label: `Loss on biological asset revaluation — ${flockLabel}`,
        debit: absChange,
        credit: 0,
      },
      {
        accountCode: null, // Biological Assets — resolved at runtime
        label: `Fair value decrease — ${flockLabel}`,
        debit: 0,
        credit: absChange,
      },
    ];
  }

  return { ref, date, lines, externalRef: ref };
}
