import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { Button, Field, Input, Textarea } from "../../components/ui";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { SignaturePad } from "../market/people/SignaturePad";
import { fileToImageDataUrl } from "../../lib/imageFile";
import {
  downloadContractPreview,
  fetchContractSettings,
  previewContract,
  saveContractSettings,
  saveContractTemplate,
  type ContractSettings,
  type ContractTemplate,
  type ContractVariable,
} from "../../api/sellerContract.api";
import { API_BASE_URL } from "../../api/config";
import { AgreementView } from "../../lib/AgreementView";
import { readAuthHeaders } from "../../lib/authHeaders";

const WANTS = [
  ["sell", "Seller"],
  ["buy", "Buyer"],
  ["scout", "Scout"],
] as const;

const EMPTY: ContractSettings = {
  otpRequired: false,
  hasLogo: false,
  hasSignature: false,
  companyLegalName: "",
  companyRegistrationNo: "",
  companyTin: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  letterheadHeader: "",
  letterheadFooter: "",
  signerName: "",
  signerTitle: "",
  commissionPercent: "",
  payoutDays: "",
  acceptanceHours: "",
  rateChangeNoticeDays: "",
  terminationNoticeDays: "",
  cancellationFeeRule: "",
  nonCircumventionMonths: "",
  circumventionPenaltyRule: "",
  disputeForum: "",
  mediationDays: "",
  dataProtectionLawReference: "",
  prevailingLanguage: "",
  payoutFeeRule: "",
};

const COMPANY_FIELDS: Array<[keyof ContractSettings, string]> = [
  ["companyLegalName", "Legal name"],
  ["companyRegistrationNo", "Registration number"],
  ["companyTin", "TIN"],
  ["companyAddress", "Address"],
  ["companyPhone", "Phone"],
  ["companyEmail", "Email"],
  ["letterheadHeader", "Letterhead header"],
  ["letterheadFooter", "Letterhead footer"],
  ["signerName", "Signer name"],
  ["signerTitle", "Signer job title"],
];

const TERM_FIELDS: Array<[keyof ContractSettings, string]> = [
  ["commissionPercent", "Commission percent"],
  ["payoutDays", "Payout days"],
  ["acceptanceHours", "Acceptance hours"],
  ["rateChangeNoticeDays", "Notice days before a rate or terms change"],
  ["terminationNoticeDays", "Days to end the agreement"],
  ["cancellationFeeRule", "Cancellation fee rule"],
  ["nonCircumventionMonths", "Months they must not go around the platform"],
  ["circumventionPenaltyRule", "Penalty if they do"],
  ["disputeForum", "Where a dispute is decided"],
  ["mediationDays", "Days to try mediation"],
  ["dataProtectionLawReference", "Data protection law"],
  ["prevailingLanguage", "Language that wins if the texts differ"],
  ["payoutFeeRule", "Who pays the payout fee"],
];

export function ContractSettingsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ContractSettings>(EMPTY);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [variables, setVariables] = useState<ContractVariable[]>([]);
  const [retention, setRetention] = useState("");
  const [want, setWant] = useState<(typeof WANTS)[number][0]>("sell");
  const [language, setLanguage] = useState("en");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchContractSettings(token);
      setSettings({ ...EMPTY, ...data.settings });
      setTemplates(data.templates || []);
      setVariables(data.variables || []);
      setRetention(data.retentionNote || "");
      const active = (data.templates || []).find((item) => item.want === want && item.language === language && item.isActive);
      if (active) setBody(active.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load contract settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // The first load follows the token. Later edits stay in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const active = templates.find((item) => item.want === want && item.language === language && item.isActive);
    setBody(active?.body || "");
    setPreview("");
  }, [want, language, templates]);

  const versions = useMemo(
    () => templates.filter((item) => item.want === want && item.language === language),
    [language, templates, want]
  );
  const activeVersion = versions.find((item) => item.isActive);

  function setField(key: keyof ContractSettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function saveCompany() {
    setBusy(true);
    try {
      const saved = await saveContractSettings(token, {
        ...settings,
        ...(logoDataUrl ? { logoDataUrl } : {}),
        ...(signatureDataUrl ? { signatureDataUrl } : {}),
      });
      setSettings({ ...EMPTY, ...saved.settings });
      setLogoDataUrl("");
      setSignatureDataUrl("");
      if (saved.warning) showToast("info", saved.warning);
      else showToast("success", "Company details saved");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function saveText() {
    setBusy(true);
    try {
      const saved = await saveContractTemplate(token, { want, language, body });
      setTemplates((prev) => [
        { ...saved.template, createdAt: new Date().toISOString(), isActive: true },
        ...prev.map((item) => (item.want === want && item.language === language ? { ...item, isActive: false } : item)),
      ]);
      showToast("success", `Saved version ${saved.template.version}. Older signed agreements are not changed.`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not save the agreement");
    } finally {
      setBusy(false);
    }
  }

  async function showPreview() {
    setBusy(true);
    try {
      const data = await previewContract(token, { want, language, body });
      setPreview(data.text);
      if (data.missing?.length) showToast("info", `Still blank: ${data.missing.join(", ")}`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not preview");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPreview() {
    setBusy(true);
    try {
      const blob = await downloadContractPreview(token, { want, language, body });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${want}-contract-preview.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not download");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <ManagerPage>
        <PageHeader title="Contracts" />
        <SkeletonList rows={6} />
      </ManagerPage>
    );
  }
  if (error) {
    return (
      <ManagerPage>
        <PageHeader title="Contracts" />
        <ErrorState message={error} onRetry={() => void load()} />
      </ManagerPage>
    );
  }

  return (
    <ManagerPage>
      <PageHeader title="Contracts" />
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Signed agreements keep the words the person saw. Later edits do not change an old signed copy.
      </p>
      {retention ? <p className="mb-4 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 py-2 text-sm">{retention}</p> : null}

      <section className="mb-8 space-y-3">
        <h2 className="text-base font-semibold">Company and signer</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {COMPANY_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <Input value={String(settings[key] ?? "")} onChange={(e) => setField(key, e.target.value)} />
            </Field>
          ))}
        </div>
        <Field label="Logo">
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void fileToImageDataUrl(file, 800).then(setLogoDataUrl);
            }}
          />
        </Field>
        {settings.hasLogo && !logoDataUrl ? <PrivateImage token={token} path="/api/super-admin/contracts/image/logo" alt="Company logo" /> : null}
        {logoDataUrl ? <img src={logoDataUrl} alt="New logo" className="h-16 rounded border border-[var(--border-color)] bg-white" /> : null}
        <Field label="Company signature">
          <SignaturePad onChange={setSignatureDataUrl} />
        </Field>
        {settings.hasSignature && !signatureDataUrl ? (
          <PrivateImage token={token} path="/api/super-admin/contracts/image/signature" alt="Saved company signature" />
        ) : null}
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-base font-semibold">Numbers and rules</h2>
        <p className="text-sm text-[var(--text-secondary)]">Leave a box blank until you know the real value. A contract cannot be sent while a blank value is still in the text.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {TERM_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <Input value={String(settings[key] ?? "")} onChange={(e) => setField(key, e.target.value)} />
            </Field>
          ))}
        </div>
        <label className="flex min-h-12 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={settings.otpRequired}
            onChange={(e) => setSettings((prev) => ({ ...prev, otpRequired: e.target.checked }))}
          />
          <span>
            Ask for a 6-digit phone code before signing. Leave this off. This app cannot send SMS yet, so turning it on stops people from finishing.
          </span>
        </label>
        <Button type="button" disabled={busy} onClick={() => void saveCompany()}>
          Save company details
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Agreement text</h2>
        <div className="flex flex-wrap gap-2">
          {WANTS.map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={want === value ? "primary" : "secondary"} onClick={() => setWant(value)}>
              {label}
            </Button>
          ))}
          <Button type="button" size="sm" variant={language === "en" ? "primary" : "secondary"} onClick={() => setLanguage("en")}>
            English
          </Button>
          <Button type="button" size="sm" variant={language === "rw" ? "primary" : "secondary"} onClick={() => setLanguage("rw")}>
            Kinyarwanda
          </Button>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {activeVersion ? `Active version ${activeVersion.version}.` : "No text in this language yet."} Saving makes a new version. Signed copies stay as they were.
          {want !== "sell" && language === "en" ? " Buyer and scout English text starts as a short draft. Replace it before a real person signs." : ""}
        </p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <Field label="Agreement">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} className="min-h-[24rem] font-mono text-sm" />
          </Field>
          <aside className="rounded-xl border border-[var(--border-color)] p-3 text-sm">
            <p className="font-semibold">Words you can insert</p>
            <ul className="mt-2 max-h-80 space-y-2 overflow-auto">
              {variables.map((item) => (
                <li key={item.key}>
                  <code className="text-xs">{`{{${item.key}}}`}</code>
                  <span className="block text-[var(--text-secondary)]">{item.label}. {item.when}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
        {versions.length > 1 ? (
          <p className="text-xs text-[var(--text-secondary)]">
            Older versions: {versions.filter((item) => !item.isActive).map((item) => `v${item.version}`).join(", ") || "none"}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || body.trim().length < 20} onClick={() => void saveText()}>
            Save as a new version
          </Button>
          <Button type="button" variant="secondary" disabled={busy || !body.trim()} onClick={() => void showPreview()}>
            Preview
          </Button>
          <Button type="button" variant="secondary" disabled={busy || !body.trim()} onClick={() => void downloadPreview()}>
            Download PDF
          </Button>
        </div>
        {preview ? (
          <div className="max-h-[32rem] overflow-auto rounded-xl border border-[var(--border-color)] p-4">
            <img src="/cleva-letterhead.png" alt="Cleva Technologies" className="mb-4 w-full" />
            <AgreementView text={preview} />
          </div>
        ) : null}
      </section>
    </ManagerPage>
  );
}

function PrivateImage({ token, path, alt }: { token: string | null; path: string; alt: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let url = "";
    let cancelled = false;
    void fetch(`${API_BASE_URL}${path}`, { headers: readAuthHeaders(token) })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, token]);
  if (!src) return null;
  return <img src={src} alt={alt} className="max-h-24 rounded border border-[var(--border-color)] bg-white" />;
}
