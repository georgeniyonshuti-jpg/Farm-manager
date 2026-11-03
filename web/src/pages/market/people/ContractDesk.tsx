import { useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { Button, Field, StatusPill, Textarea } from "../../../components/ui";
import { useToast } from "../../../components/Toast";
import type { RecruitmentContact } from "../../../api/marketInsights.api";
import {
  approveRecruitmentContract,
  fetchContractReview,
  fetchPrivateFile,
  rejectRecruitmentContract,
  sendRecruitmentContract,
  type ContractReview,
} from "../../../api/sellerContract.api";
import { contractBadgeLabel } from "./peopleWork";
import { finishMove } from "./recruitmentBoard";

type Props = {
  contact: RecruitmentContact;
  canApprove: boolean;
  busy?: boolean;
  onChanged: (contact: RecruitmentContact) => void;
};

function fullLink(url: string) {
  if (url.startsWith("http")) return url;
  return `${window.location.origin}${url}`;
}

export function ContractDesk({ contact, canApprove, busy, onChanged }: Props) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [review, setReview] = useState<ContractReview | null>(null);
  const [images, setImages] = useState<{ signature?: string; selfie?: string }>({});
  const [link, setLink] = useState("");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const label = contractBadgeLabel(contact);

  useEffect(() => {
    let cancelled = false;
    void fetchContractReview(token, contact.id)
      .then((data) => {
        if (!cancelled) setReview(data);
      })
      .catch(() => {
        if (!cancelled) setReview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [contact.contractStatus, contact.id, contact.kycContractStatus, token]);

  const signatureFile = review?.files?.signature;
  const selfieFile = review?.files?.selfie;

  useEffect(() => {
    let signatureUrl = "";
    let selfieUrl = "";
    let cancelled = false;
    async function load() {
      if (signatureFile) {
        const blob = await fetchPrivateFile(token, signatureFile);
        if (cancelled) return;
        signatureUrl = URL.createObjectURL(blob);
      }
      if (selfieFile) {
        const blob = await fetchPrivateFile(token, selfieFile);
        if (cancelled) return;
        selfieUrl = URL.createObjectURL(blob);
      }
      if (!cancelled) setImages({ signature: signatureUrl, selfie: selfieUrl });
    }
    void load().catch(() => undefined);
    return () => {
      cancelled = true;
      if (signatureUrl) URL.revokeObjectURL(signatureUrl);
      if (selfieUrl) URL.revokeObjectURL(selfieUrl);
    };
  }, [selfieFile, signatureFile, token]);

  function apply(next: RecruitmentContact, message: string) {
    finishMove(contact.id, next);
    onChanged(next);
    showToast("success", message);
  }

  async function send(resend: boolean) {
    setWorking(true);
    try {
      const saved = await sendRecruitmentContract(token, contact.id, resend);
      const url = fullLink(saved.url);
      setLink(url);
      showToast("success", "Email sent. They must log in with their account to sign.");
      finishMove(contact.id, saved.contact);
      onChanged(saved.contact);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not send the contract");
    } finally {
      setWorking(false);
    }
  }

  async function approve() {
    setWorking(true);
    try {
      const saved = await approveRecruitmentContract(token, contact.id);
      if (saved.copyUrl) setLink(fullLink(saved.copyUrl));
      const moved = saved.contact.stage === "onboarded";
      apply(saved.contact, moved ? "Approved. They are onboarded." : "Contract approved. The other checks still need approval.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not approve");
    } finally {
      setWorking(false);
    }
  }

  async function reject() {
    setWorking(true);
    try {
      const saved = await rejectRecruitmentContract(token, contact.id, reason);
      if (saved.url) setLink(fullLink(saved.url));
      apply(saved.contact, saved.linkError ? `Rejected. ${saved.linkError}` : "Rejected. A new link is ready.");
      setReason("");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not reject");
    } finally {
      setWorking(false);
    }
  }

  const locked = Boolean(busy || working);
  const status = review?.contract?.status;
  const showReview = status === "signed" || status === "approved" || status === "rejected";

  return (
    <div className="space-y-3">
      <StatusPill tone={status === "approved" ? "success" : status === "rejected" ? "danger" : status === "signed" ? "warning" : "neutral"}>
        {label}
      </StatusPill>
      <p className="text-sm text-[var(--text-secondary)]">
        We email the link to their account. They have to log in with that account before they can sign. Someone else with the link cannot sign it.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={locked || status === "signed" || status === "approved"} onClick={() => void send(false)}>
          Send contract
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={locked || status === "signed" || status === "approved"} onClick={() => void send(true)}>
          Resend
        </Button>
      </div>
      {link ? (
        <Field label="Link">
          <input readOnly value={link} className="w-full rounded-xl border border-[var(--border-color)] px-3 py-2 text-sm" onFocus={(e) => e.currentTarget.select()} />
        </Field>
      ) : null}
      {showReview && review?.contract ? (
        <div className="space-y-3 rounded-xl border border-[var(--border-color)] p-3">
          <p className="text-sm font-semibold">Signed copy, version {review.contract.templateVersion || "—"}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{review.contract.text}</pre>
          <p className="text-sm">Typed name: {review.contract.typedName || "—"}</p>
          <p className="text-sm">Phone: {contact.phone}</p>
          <p className="text-sm">Signed: {review.contract.signedAt ? new Date(review.contract.signedAt).toLocaleString() : "—"}</p>
          <p className="text-sm">IP: {review.contract.ip || "—"}</p>
          <p className="text-sm break-all">Device: {review.contract.userAgent || "—"}</p>
          <p className="text-sm">Phone code: {review.contract.otpVerified ? "Checked" : "Not used"}</p>
          <p className="text-sm break-all">Fingerprint: {review.contract.fingerprint || "—"}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {images.signature ? <img src={images.signature} alt="Drawn signature" className="max-h-32 rounded border border-[var(--border-color)] bg-white" /> : <p className="text-sm">No signature image</p>}
            {images.selfie ? <img src={images.selfie} alt="Selfie" className="max-h-40 rounded border border-[var(--border-color)] object-cover" /> : <p className="text-sm">No selfie</p>}
            {contact.kycIdPhotoUrl ? <img src={contact.kycIdPhotoUrl} alt="ID photo" className="max-h-40 rounded border border-[var(--border-color)] object-cover" /> : <p className="text-sm">No ID photo yet</p>}
          </div>
          <p className="text-sm">ID number: {contact.kycIdNumber || "Not provided"}</p>
          {canApprove && status === "signed" ? (
            <div className="space-y-2">
              <Button type="button" size="sm" disabled={locked} onClick={() => void approve()}>Approve</Button>
              <Field label="Reason if you reject">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </Field>
              <Button type="button" size="sm" variant="danger" disabled={locked || reason.trim().length < 3} onClick={() => void reject()}>
                Reject
              </Button>
            </div>
          ) : null}
          {(review.history?.length || 0) > 1 ? (
            <ul className="text-xs text-[var(--text-secondary)]">
              {review.history.map((item) => (
                <li key={item.id}>{item.status}{item.rejectionReason ? ` — ${item.rejectionReason}` : ""}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
