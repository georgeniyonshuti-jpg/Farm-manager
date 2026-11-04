/** The BigChix wordmark: a flame and BIG + CHIX in the shop's display type. */
export function BigChixMark({ size = 26 }: { size?: number }) {
  return (
    <span className="bcx-mark" style={{ fontSize: size }}>
      <svg viewBox="0 0 24 24" width="0.95em" height="0.95em" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12.6 1.8c.4 3-1.3 4.6-2.9 6.3C8 9.9 6.3 11.8 6.3 14.6A5.7 5.7 0 0 0 12 20.3a5.7 5.7 0 0 0 5.7-5.7c0-2.2-1-3.9-2.2-5.3-.1 1.4-.8 2.6-2 3.1.6-3.7-.2-7.6-.9-11.2Z"
        />
        <path fill="#ffc23d" d="M12 20.3a3 3 0 0 1-3-3c0-1.7 1.4-2.7 2.3-3.9.3 1.2 1.1 1.9 2 2.3.6-.6.9-1.3 1-2 .5.8.7 1.6.7 2.6a3 3 0 0 1-3 4Z" />
      </svg>
      <span className="bcx-word">
        BIG<span>CHIX</span>
      </span>
    </span>
  );
}
