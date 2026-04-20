import express from "express";
import {
  createCustomerInvoice,
  createVendorBill,
  createJournalEntry,
  getAccountList,
  getInvoices,
} from "../services/odoo/odooAccounting.js";
import {
  mapOdooError,
  validateInvoicePayload,
  validateVendorBillPayload,
  validateJournalPayload,
  validateInvoiceFilters,
} from "../services/odoo/odooHelpers.js";

const router = express.Router();

function unauthorized(res) {
  res.status(401).json({ success: false, error: "Unauthorized." });
}

/**
 * Internal machine-to-machine protection for /api/accounting/*.
 */
function internalBearerAuth(req, res, next) {
  const configured = String(process.env.INTERNAL_API_SECRET ?? "");
  if (!configured) {
    res.status(500).json({ success: false, error: "INTERNAL_API_SECRET is not configured." });
    return;
  }

  const authHeader = String(req.headers.authorization ?? "");
  if (!authHeader.startsWith("Bearer ")) {
    unauthorized(res);
    return;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || token !== configured) {
    unauthorized(res);
    return;
  }
  next();
}

router.use(internalBearerAuth);

router.post("/invoice", async (req, res) => {
  try {
    validateInvoicePayload(req.body ?? {});
    const data = await createCustomerInvoice(req.body ?? {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, error: mapOdooError(error) });
  }
});

router.post("/bill", async (req, res) => {
  try {
    validateVendorBillPayload(req.body ?? {});
    const data = await createVendorBill(req.body ?? {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, error: mapOdooError(error) });
  }
});

router.post("/journal-entry", async (req, res) => {
  try {
    validateJournalPayload(req.body ?? {});
    const data = await createJournalEntry(req.body ?? {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, error: mapOdooError(error) });
  }
});

router.get("/accounts", async (_req, res) => {
  try {
    const data = await getAccountList();
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, error: mapOdooError(error) });
  }
});

router.get("/invoices", async (req, res) => {
  try {
    const filters = {
      dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : undefined,
      dateTo: req.query.dateTo ? String(req.query.dateTo) : undefined,
      state: req.query.state ? String(req.query.state) : undefined,
    };
    validateInvoiceFilters(filters);
    const data = await getInvoices(filters);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, error: mapOdooError(error) });
  }
});

export default router;
