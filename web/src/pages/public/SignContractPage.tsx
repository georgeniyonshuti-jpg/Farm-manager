import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui";
import { AgreementView } from "../../lib/AgreementView";
import { SignaturePad } from "../market/people/SignaturePad";
import { fileToImageDataUrl } from "../../lib/imageFile";
import {
  checkSigningCode,
  downloadSignedPdf,
  fetchSigningSession,
  requestSigningCode,
  setSigningLanguage,
  submitSignature,
  type SigningSession,
} from "../../api/sellerContract.api";

const DRAFT_KEY = (token: string) => `cleva-sign-${token}`;

type Draft = {
  step: number;
  language: string;
  read: boolean;
  electronic: boolean;
  typedName: string;
  atBottom: boolean;
  signature: string;
  selfie: string;
};

function loadDraft(token: string): Partial<Draft> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY(token));
    return raw ? (JSON.parse(raw) as Partial<Draft>) : {};
  } catch {
    return {};
  }
}

function saveDraft(token: string, draft: Draft) {
  try {
    const copy = { ...draft };
    if (copy.signature.length + copy.selfie.length > 1_500_000) {
      copy.signature = "";
      copy.selfie = "";
    }
    sessionStorage.setItem(DRAFT_KEY(token), JSON.stringify(copy));
  } catch {
    /* The phone may be out of space. The answers stay on the screen until it is closed. */
  }
}

export function SignContractPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { token: authToken, user, bootstrapped, logout } = useAuth();
  const saved = loadDraft(token);
  const loginNext = `/login?next=${encodeURIComponent(`/sign/${token}`)}`;
  const [session, setSession] = useState<SigningSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(saved.step || 1);
  const [language, setLanguage] = useState(saved.language || "en");
  const [read, setRead] = useState(Boolean(saved.read));
  const [electronic, setElectronic] = useState(Boolean(saved.electronic));
  const [typedName, setTypedName] = useState(saved.typedName || "");
  const [atBottom, setAtBottom] = useState(Boolean(saved.atBottom));
  const [signature, setSignature] = useState(saved.signature || "");
  const [selfie, setSelfie] = useState(saved.selfie || "");
  const [code, setCode] = useState("");
  const [codeOk, setCodeOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraHelp, setCameraHelp] = useState("");
  const sending = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const otpStep = Boolean(session?.otpRequired);
  const total = otpStep ? 7 : 6;

  useEffect(() => {
    if (!bootstrapped) return;
    if (!user) {
      navigate(loginNext, { replace: true });
      return;
    }
    let cancelled = false;
    void fetchSigningSession(authToken, token)
      .then((data) => {
        if (cancelled) return;
        setSession(data.session);
        setLanguage(data.session.language || "en");
        const closedNow = ["signed", "approved", "expired", "rejected"].includes(data.session.status);
        if (closedNow) setStep(data.session.otpRequired ? 7 : 6);
        else if (!data.session.otpRequired) setStep((current) => (current >= 6 ? 5 : current));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "This link is not valid.");
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, bootstrapped, loginNext, navigate, token, user]);

  useEffect(() => {
    saveDraft(token, { step, language, read, electronic, typedName, atBottom, signature, selfie });
  }, [atBottom, electronic, language, read, selfie, signature, step, token, typedName]);

  useEffect(() => {
    if (step !== 2) return;
    const el = scrollerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.clientHeight < 24) setAtBottom(true);
  }, [session?.text, step]);

  useEffect(() => {
    if (step !== 5) return;
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraHelp("");
      } catch {
        if (!cancelled) setCameraHelp("The camera is blocked. Use the button below to choose a photo of your face instead.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [step]);

  useEffect(() => {
    const box = scrollerRef.current;
    if (!box) return;
    if (box.scrollHeight <= box.clientHeight + 8) setAtBottom(true);
  }, [session?.text, step]);

  async function changeLanguage(next: string) {
    if (!session?.languages?.includes(next)) {
      setError("That language is not ready yet. Please read the other version.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await setSigningLanguage(authToken, token, next);
      setSession(data.session);
      setLanguage(next);
      setAtBottom(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the language.");
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraHelp("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraHelp("The camera is blocked. Use the button below to choose a photo of your face instead.");
    }
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 800 / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    canvas.width = Math.max(1, Math.round((video.videoWidth || 1) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 1) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSelfie(canvas.toDataURL("image/jpeg", 0.72));
  }

  async function finish() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await submitSignature(authToken, token, {
        typedName,
        signatureDataUrl: signature,
        selfieDataUrl: selfie,
        readConfirmed: read,
        electronicConsent: electronic,
        language,
      });
      const data = await fetchSigningSession(authToken, token);
      setSession(data.session);
      setStep(total);
      sessionStorage.removeItem(DRAFT_KEY(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The phone could not send the agreement. Your answers are still here. Try again.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (error && !session) {
    return (
      <main className="mx-auto min-h-dvh max-w-lg px-4 py-8 text-lg">
        <h1 className="text-2xl font-semibold">This link does not work</h1>
        <p className="mt-3">{error}</p>
        {user ? (
          <Button type="button" className="mt-6" onClick={() => void logout().then(() => navigate(loginNext))}>
            Log in with the right account
          </Button>
        ) : null}
      </main>
    );
  }
  if (!session) {
    return <main className="mx-auto min-h-dvh max-w-lg px-4 py-8 text-lg">Loading your agreement…</main>;
  }

  const closed = ["signed", "approved", "expired", "rejected"].includes(session.status);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-6 text-lg">
      <p className="text-sm font-semibold text-[var(--text-secondary)]">Step {Math.min(step, total)} of {total}</p>
      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" variant={language === "en" ? "primary" : "secondary"} disabled={busy || closed} onClick={() => void changeLanguage("en")}>
          English
        </Button>
        <Button type="button" size="sm" variant={language === "rw" ? "primary" : "secondary"} disabled={busy || closed} onClick={() => void changeLanguage("rw")}>
          Kinyarwanda
        </Button>
      </div>
      {error ? <p className="mt-3 rounded-lg bg-[var(--surface-subtle)] px-3 py-2 text-base">{error}</p> : null}

      {step === 1 && !closed ? (
        <section className="mt-6 flex flex-1 flex-col">
          <h1 className="text-3xl font-semibold">Hello {session.name || "there"}</h1>
          <p className="mt-4">This is your agreement with Cleva. You can read it, sign it with your finger, and take a photo of your face.</p>
          <Button type="button" className="mt-auto" size="lg" onClick={() => setStep(2)}>Continue</Button>
        </section>
      ) : null}

      {step === 2 && !closed ? (
        <section className="mt-4 flex min-h-0 flex-1 flex-col">
          <h1 className="text-2xl font-semibold">Read the agreement</h1>
          <div
            ref={scrollerRef}
            className="mt-3 max-h-[55dvh] overflow-auto rounded-xl border border-[var(--border-color)] p-3 text-base"
            onScroll={(event) => {
              const el = event.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setAtBottom(true);
            }}
          >
            <img src="/cleva-letterhead.png" alt="Cleva Technologies" className="mb-3 w-full" />
            {session.letterheadHeader ? <p className="mb-3 text-sm text-[var(--text-secondary)]">{session.letterheadHeader}</p> : null}
            {session.text ? <AgreementView text={session.text} /> : <p>The agreement is not ready in this language yet.</p>}
          </div>
          {session.letterheadFooter ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{session.letterheadFooter}</p> : null}
          <Button type="button" className="mt-4" size="lg" disabled={!atBottom || !session.text} onClick={() => setStep(3)}>
            {atBottom ? "Continue" : "Scroll to the bottom first"}
          </Button>
        </section>
      ) : null}

      {step === 3 && !closed ? (
        <section className="mt-6 flex flex-1 flex-col gap-4">
          <h1 className="text-2xl font-semibold">Do you agree?</h1>
          <label className="flex min-h-12 items-start gap-3">
            <input type="checkbox" className="mt-1 h-6 w-6" checked={read} onChange={(e) => setRead(e.target.checked)} />
            <span>I have read and understood this agreement.</span>
          </label>
          <label className="flex min-h-12 items-start gap-3">
            <input type="checkbox" className="mt-1 h-6 w-6" checked={electronic} onChange={(e) => setElectronic(e.target.checked)} />
            <span>I agree to sign electronically.</span>
          </label>
          <Button type="button" className="mt-auto" size="lg" disabled={!read || !electronic} onClick={() => setStep(4)}>Continue</Button>
        </section>
      ) : null}

      {step === 4 && !closed ? (
        <section className="mt-6 flex flex-1 flex-col gap-3">
          <h1 className="text-2xl font-semibold">Your name and signature</h1>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Full name, as on your ID</span>
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-[var(--border-color)] px-3 text-lg"
              autoComplete="name"
            />
          </label>
          <p className="text-sm">Sign with your finger in the box.</p>
          <SignaturePad onChange={setSignature} />
          <Button type="button" className="mt-auto" size="lg" disabled={typedName.trim().length < 3 || signature.length < 80} onClick={() => setStep(5)}>
            Continue
          </Button>
        </section>
      ) : null}

      {step === 5 && !closed ? (
        <section className="mt-6 flex flex-1 flex-col gap-3">
          <h1 className="text-2xl font-semibold">A photo of your face</h1>
          <p>Put your face in the circle, in good light.</p>
          <div className="relative overflow-hidden rounded-full border-4 border-[var(--border-color)]">
            <video ref={videoRef} autoPlay playsInline muted className="aspect-square w-full object-cover" />
          </div>
          {cameraHelp ? <p className="text-base">{cameraHelp}</p> : null}
          {selfie ? <img src={selfie} alt="Your photo" className="h-32 w-32 rounded-full object-cover" /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={takePhoto}>Take photo</Button>
            <Button type="button" variant="ghost" onClick={() => { setSelfie(""); void startCamera(); }}>Retake</Button>
          </div>
          <label className="text-sm">
            Choose a photo instead
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="mt-1 block w-full text-base"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void fileToImageDataUrl(file, 800).then(setSelfie);
              }}
            />
          </label>
          <Button
            type="button"
            className="mt-auto"
            size="lg"
            disabled={!selfie || busy}
            onClick={() => {
              if (otpStep) setStep(6);
              else void finish();
            }}
          >
            {otpStep ? "Continue" : busy ? "Sending…" : "Submit"}
          </Button>
        </section>
      ) : null}

      {step === 6 && otpStep && !closed ? (
        <section className="mt-6 flex flex-1 flex-col gap-3">
          <h1 className="text-2xl font-semibold">Phone code</h1>
          <p>We send a 6-digit code to the phone number we already have.</p>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void requestSigningCode(authToken, token)
                .then(() => setError(null))
                .catch((e) => setError(e instanceof Error ? e.message : "Could not send the code."))
                .finally(() => setBusy(false));
            }}
          >
            Send code
          </Button>
          <input
            value={code}
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="min-h-12 w-full rounded-xl border border-[var(--border-color)] px-3 text-2xl tracking-widest"
            placeholder="000000"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy || code.length !== 6}
            onClick={() => {
              setBusy(true);
              void checkSigningCode(authToken, token, code)
                .then(() => setCodeOk(true))
                .catch((e) => setError(e instanceof Error ? e.message : "That code is not correct."))
                .finally(() => setBusy(false));
            }}
          >
            {codeOk ? "Code accepted" : "Check code"}
          </Button>
          <Button type="button" className="mt-auto" size="lg" disabled={!codeOk || busy} onClick={() => void finish()}>
            {busy ? "Sending…" : "Submit"}
          </Button>
        </section>
      ) : null}

      {(closed || step === total) && session.status !== "opened" && session.status !== "sent" ? (
        <section className="mt-6">
          <h1 className="text-3xl font-semibold">{session.status === "approved" ? "Your agreement is approved" : session.status === "signed" ? "Thank you" : "This link is closed"}</h1>
          <p className="mt-4">{session.message || "Thank you. We are reviewing your agreement."}</p>
          {session.hasPdf ? (
            <button
              type="button"
              className="mt-6 inline-flex min-h-12 items-center text-lg font-semibold underline"
              onClick={() => {
                void downloadSignedPdf(authToken, token)
                  .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "cleva-agreement.pdf";
                    link.click();
                    URL.revokeObjectURL(url);
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : "Could not download the agreement."));
              }}
            >
              Download your copy
            </button>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
