import { useEffect, useState } from "react";
import type { ApiHealthStatus } from "../hooks/useApiHealthStatus";

const LOADING_STEPS = [
  { message: "Connecting to workspace...", duration: 600 },
  { message: "Loading your flocks...", duration: 800 },
  { message: "Fetching check-in data...", duration: 700 },
  { message: "Syncing schedules...", duration: 600 },
  { message: "Almost ready...", duration: 500 },
] as const;

type Props = {
  apiStatus?: ApiHealthStatus;
};

export function AppLoadingScreen({ apiStatus = "checking" }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState("");

  useEffect(() => {
    let step = 0;
    const totalDuration = LOADING_STEPS.reduce((sum, s) => sum + s.duration, 0);
    let elapsed = 0;

    const advance = () => {
      if (step < LOADING_STEPS.length - 1) {
        elapsed += LOADING_STEPS[step].duration;
        step += 1;
        setStepIndex(step);
        setProgress(Math.round((elapsed / totalDuration) * 90));
        window.setTimeout(advance, LOADING_STEPS[step].duration);
      }
    };

    const t = window.setTimeout(advance, LOADING_STEPS[0].duration);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : `${d}.`));
    }, 400);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (apiStatus === "up") setProgress(100);
  }, [apiStatus]);

  const currentMessage = LOADING_STEPS[stepIndex]?.message ?? "Getting everything ready...";
  const messageBase = currentMessage.replace(/\.\.\.$/, "");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f0f9ff 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 20,
          padding: "40px 48px",
          width: 340,
          boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: "linear-gradient(135deg, #166534 0%, #16a34a 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            fontSize: 36,
            boxShadow: "0 4px 16px rgba(22,101,52,0.25)",
          }}
          aria-hidden
        >
          🐔
        </div>

        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#111827",
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}
        >
          Farm Manager
        </div>

        <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 28 }}>Clevafarm</div>

        <div
          style={{
            height: 6,
            background: "#E5E7EB",
            borderRadius: 99,
            overflow: "hidden",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #16a34a, #4ade80)",
              borderRadius: 99,
              transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>

        <div style={{ fontSize: 13, color: "#6B7280", minHeight: 20, transition: "opacity 0.3s" }}>
          {messageBase}
          {dots}
        </div>

        {apiStatus === "down" ? (
          <div
            style={{
              marginTop: 16,
              padding: "8px 14px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 8,
              fontSize: 12,
              color: "#991B1B",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span aria-hidden>⚠️</span>
            <span>Having trouble reaching the server. Retrying...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
