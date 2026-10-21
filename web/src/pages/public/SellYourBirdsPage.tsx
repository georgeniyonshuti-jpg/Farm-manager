import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { DistrictSelect } from "../../components/DistrictSelect";
import { type PublicOutletCtx } from "../../components/public/PublicLayout";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { saveSellerApply } from "../../lib/sellerApply";

const STEPS = [
  { n: "1", title: "Apply", body: "Your name, phone, and where the birds are." },
  { n: "2", title: "Add flocks", body: "Birds, weight, and when they are ready. They stay on your account." },
  { n: "3", title: "We review", body: "A manager approves you and each flock before buyers see them." },
];

export function SellYourBirdsPage() {
  const { locale } = useOutletContext<PublicOutletCtx>();
  const navigate = useNavigate();
  usePublicMeta("Sell your birds", "Apply as a seller and keep your flocks on your account.");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [district, setDistrict] = useState("");
  const [sector, setSector] = useState("");
  const [birds, setBirds] = useState("");
  const [avgKg, setAvgKg] = useState("1.8");
  const [error, setError] = useState<string | null>(null);

  function continueToAccount() {
    const contactName = name.trim();
    const contactPhone = phone.trim();
    const place = district.trim();
    const birdCount = Number(birds);
    const kg = Number(avgKg);
    if (!contactName || !contactPhone || !place || !sector.trim()) {
      setError("Name, phone, district, and sector are required.");
      return;
    }
    if (birds.trim() && (!Number.isFinite(birdCount) || birdCount <= 0)) {
      setError("Enter how many birds, or leave that blank for now.");
      return;
    }
    saveSellerApply({
      contactName,
      phone: contactPhone,
      district: place,
      sector: sector.trim(),
      birds: Number.isFinite(birdCount) && birdCount > 0 ? birdCount : 0,
      avgKg: Number.isFinite(kg) && kg > 0 ? kg : 1.8,
    });
    navigate("/signup?from=market&accountType=farmer");
  }

  return (
    <div>
      <section className="store-hero" id="store-hero-edge">
        <div className="store-wrap relative z-10 py-10 sm:py-14">
          <p className="store-kicker">For farms</p>
          <h1 className="store-display mt-3 max-w-3xl">Sell your birds.</h1>
          <p className="store-hero-lead max-w-xl">
            Apply from here. Your flocks stay on your account while we review them. Buyers see a flock only after it is approved.
          </p>
        </div>
      </section>

      <div className="store-wrap store-body">
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-card)] p-4">
              <p className="text-sm font-semibold text-[var(--store-ember)]">{step.n}</p>
              <p className="mt-1 font-semibold text-[var(--store-ink)]">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--store-muted)]">{step.body}</p>
            </li>
          ))}
        </ol>

        <form
          className="store-form mx-auto mt-8 max-w-lg rounded-3xl border border-[var(--store-line)] bg-[var(--store-card)] p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            continueToAccount();
          }}
        >
          <p className="store-request-title">Start your seller account</p>
          <p className="text-sm leading-relaxed text-[var(--store-muted)]">
            Add a first flock if you know the count. You can add more after the account exists.
          </p>
          <label className="store-field">
            <span>
              Your name <em className="store-required">*</em>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
          <label className="store-field">
            <span>
              Phone <em className="store-required">*</em>
            </span>
            <input
              type="tel"
              inputMode="tel"
              placeholder="+250 7…"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required
            />
          </label>
          <DistrictSelect
            variant="store"
            locale={locale}
            layout="stack"
            value={district}
            sector={sector}
            onChange={setDistrict}
            onSectorChange={setSector}
            required
          />
          <div className="store-field-row">
            <label className="store-field">
              <span>Birds</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="Optional"
                value={birds}
                onChange={(e) => setBirds(e.target.value)}
              />
            </label>
            <label className="store-field">
              <span>Kg each</span>
              <input
                type="number"
                min={0.8}
                step={0.1}
                inputMode="decimal"
                value={avgKg}
                onChange={(e) => setAvgKg(e.target.value)}
              />
            </label>
          </div>
          {error ? (
            <p className="text-sm text-[#9a3412]" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="store-btn store-btn-ember w-full">
            Continue
          </button>
          <p className="store-form-footer">
            Already selling here? <Link to="/login">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
