import { useState, type ReactNode } from "react";
import { Button, Field, Input, StatusPill } from "../../../components/ui";
import { DistrictSelect } from "../../../components/DistrictSelect";
import type { RecruitmentContact } from "../../../api/marketInsights.api";
import { SignaturePad } from "./SignaturePad";

type Task = "contract" | "location" | "payment" | "identity";

type Props = {
  contact: RecruitmentContact;
  desk: boolean;
  busy?: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
};

const STATUS_TONE = {
  missing: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
} as const;

function tone(status?: string | null) {
  if (status === "submitted" || status === "approved" || status === "rejected") return STATUS_TONE[status];
  return STATUS_TONE.missing;
}

async function fileToImageUrl(file: File) {
  const data = await file.arrayBuffer();
  const blob = new Blob([data], { type: file.type || "image/jpeg" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not read that image."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read that image.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function KycPanel({ contact, desk, busy, onSubmit }: Props) {
  const [signature, setSignature] = useState(contact.kycSignatureUrl || "");
  const [district, setDistrict] = useState(contact.district || "");
  const [sector, setSector] = useState(contact.sector || "");
  const [place, setPlace] = useState(contact.kycPlace || "");
  const [momo, setMomo] = useState(contact.kycMomoPhone || "");
  const [proof, setProof] = useState(contact.kycPaymentProofUrl || "");
  const [idNumber, setIdNumber] = useState(contact.kycIdNumber || "");
  const [idPhoto, setIdPhoto] = useState(contact.kycIdPhotoUrl || "");
  const contract = contact.kycContractSnapshot || contact.contractText || "";

  async function send(task: Task, review?: "approved" | "rejected") {
    if (task === "contract") await onSubmit({ task, signatureUrl: signature, review });
    if (task === "location") await onSubmit({ task, district, sector, place, review });
    if (task === "payment") await onSubmit({ task, momoPhone: momo, proofUrl: proof, review });
    if (task === "identity") await onSubmit({ task, idNumber, photoUrl: idPhoto, review });
  }

  const contractStatus = contact.kycContractStatus || "missing";
  const locationStatus = contact.kycLocationStatus || "missing";
  const paymentStatus = contact.kycPaymentStatus || "missing";
  const identityStatus = contact.kycIdentityStatus || "missing";

  return (
    <div className="space-y-4">
      <TaskCard title="Contract" status={contractStatus}>
        {contractStatus === "approved" ? (
          <p className="text-sm text-[var(--text-secondary)]">The contract is signed and approved.</p>
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{contract}</pre>
        )}
        {contact.kycSignatureUrl ? (
          <img src={contact.kycSignatureUrl} alt="Saved signature" className="mt-3 max-h-24 rounded border border-[var(--border-color)] bg-white" />
        ) : null}
        {contractStatus === "missing" || contractStatus === "rejected" ? (
          <div className="mt-3">
            <SignaturePad onChange={setSignature} />
          </div>
        ) : null}
        <Actions
          status={contractStatus}
          desk={desk}
          busy={busy}
          saveLabel={desk ? "Save signature" : "Sign"}
          onSave={() => send("contract")}
          onReview={(review) => send("contract", review)}
        />
      </TaskCard>
      <TaskCard title="Location" status={locationStatus}>
        {locationStatus === "approved" ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {[contact.sector, contact.district, contact.kycPlace].filter(Boolean).join(", ") || "Place approved."}
          </p>
        ) : (
          <>
            <DistrictSelect
              layout="stack"
              value={district}
              sector={sector}
              onChange={setDistrict}
              onSectorChange={setSector}
            />
            <div className="mt-2">
              <Field label="Place">
                <Input value={place} placeholder="Village, cell, or landmark" onChange={(e) => setPlace(e.target.value)} />
              </Field>
            </div>
          </>
        )}
        <Actions
          status={locationStatus}
          desk={desk}
          busy={busy}
          saveLabel={desk ? "Save place" : "Confirm place"}
          onSave={() => send("location")}
          onReview={(review) => send("location", review)}
        />
      </TaskCard>
      <TaskCard title="Mobile money" status={paymentStatus}>
        {paymentStatus === "approved" ? (
          <p className="text-sm text-[var(--text-secondary)]">{contact.kycMomoPhone || "Payment approved."}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="MoMo number">
              <Input value={momo} inputMode="tel" placeholder="0781234567" onChange={(e) => setMomo(e.target.value)} />
            </Field>
            <Field label="Screenshot">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void fileToImageUrl(file).then(setProof);
                }}
              />
            </Field>
          </div>
        )}
        {proof && paymentStatus !== "approved" ? <img src={proof} alt="Mobile money proof" className="mt-3 max-h-40 rounded border border-[var(--border-color)]" /> : null}
        {paymentStatus === "approved" && contact.kycPaymentProofUrl ? (
          <img src={contact.kycPaymentProofUrl} alt="Mobile money proof" className="mt-3 max-h-40 rounded border border-[var(--border-color)]" />
        ) : null}
        <Actions
          status={paymentStatus}
          desk={desk}
          busy={busy}
          saveLabel={desk ? "Save payment" : "Submit payment"}
          onSave={() => send("payment")}
          onReview={(review) => send("payment", review)}
        />
      </TaskCard>
      <TaskCard title="ID" status={identityStatus}>
        {identityStatus === "approved" ? (
          <p className="text-sm text-[var(--text-secondary)]">{contact.kycIdNumber || "ID approved."}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="ID number">
              <Input value={idNumber} placeholder="National ID number" onChange={(e) => setIdNumber(e.target.value)} />
            </Field>
            <Field label="ID photo">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void fileToImageUrl(file).then(setIdPhoto);
                }}
              />
            </Field>
          </div>
        )}
        {idPhoto && identityStatus !== "approved" ? (
          <img src={idPhoto} alt="ID photo" className="mt-3 max-h-40 rounded border border-[var(--border-color)]" />
        ) : null}
        {identityStatus === "approved" && contact.kycIdPhotoUrl ? (
          <img src={contact.kycIdPhotoUrl} alt="ID photo" className="mt-3 max-h-40 rounded border border-[var(--border-color)]" />
        ) : null}
        <Actions
          status={identityStatus}
          desk={desk}
          busy={busy}
          saveLabel={desk ? "Save ID" : "Submit ID"}
          onSave={() => send("identity")}
          onReview={(review) => send("identity", review)}
        />
      </TaskCard>
    </div>
  );
}

function TaskCard({ title, status, children }: { title: string; status?: string | null; children: ReactNode }) {
  const label = status || "missing";
  return (
    <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        <StatusPill tone={tone(label)}>{label.replace("_", " ")}</StatusPill>
      </div>
      {children}
    </section>
  );
}

function Actions({
  status,
  desk,
  busy,
  saveLabel,
  onSave,
  onReview,
}: {
  status: string;
  desk: boolean;
  busy?: boolean;
  saveLabel: string;
  onSave: () => Promise<void>;
  onReview: (review: "approved" | "rejected") => Promise<void>;
}) {
  if (status === "approved") return null;
  if (status === "submitted" && desk) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void onReview("approved")}>
          Approve
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onReview("rejected")}>
          Reject
        </Button>
      </div>
    );
  }
  if (status === "submitted") return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={busy} onClick={() => void onSave()}>
        {saveLabel}
      </Button>
    </div>
  );
}
