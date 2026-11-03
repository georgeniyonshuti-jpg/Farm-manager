import { layoutAgreement } from "./agreementLayout";

function Runs({ runs }: { runs: Array<{ text: string; bold: boolean }> }) {
  return (
    <>
      {runs.map((run, index) =>
        run.bold ? <strong key={index}>{run.text}</strong> : <span key={index}>{run.text}</span>
      )}
    </>
  );
}

function SignatureCard({
  label,
  name,
  role,
  whenLabel,
  when,
}: {
  label: string;
  name: string;
  role: string;
  whenLabel: string;
  when: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] p-3">
      <p className="text-sm font-semibold text-[#0E2A47]">{label}</p>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">Name</p>
      {name ? <p className="text-sm">{name}</p> : <div className="mt-3 border-b border-[var(--border-color)]" />}
      {role ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{role}</p> : null}
      <p className="mt-3 text-xs text-[var(--text-secondary)]">Signature</p>
      <div className="mt-4 border-b border-[var(--border-color)]" />
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{when ? `${whenLabel}: ${when}` : whenLabel}</p>
    </div>
  );
}

/** The agreement as a person should read it, without hash marks or stars. */
export function AgreementView({ text }: { text: string }) {
  const layout = layoutAgreement(text);
  const seller = layout.signatures?.seller;
  const company = layout.signatures?.company;
  return (
    <div className="space-y-3 text-[15px] leading-6 text-[var(--text-primary)]">
      {layout.blocks.map((block, index) => {
        if (block.type === "title") {
          return (
            <h2 key={index} className="text-xl font-semibold text-[#0E2A47]">
              {block.text}
            </h2>
          );
        }
        if (block.type === "heading") {
          return (
            <h3 key={index} className="pt-2 text-base font-semibold text-[#0E2A47]">
              {block.text}
            </h3>
          );
        }
        return (
          <p key={index} className={block.indent ? "pl-4" : undefined}>
            <Runs runs={block.runs} />
          </p>
        );
      })}
      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        <SignatureCard
          label={seller?.label || "For the Seller"}
          name={seller?.name || ""}
          role=""
          whenLabel="Signed on"
          when={seller?.signedOn || ""}
        />
        <SignatureCard
          label={company?.label || "For the Company"}
          name={company?.name || ""}
          role={company?.title || ""}
          whenLabel="Approved on"
          when={company?.approvedOn || ""}
        />
      </div>
    </div>
  );
}
