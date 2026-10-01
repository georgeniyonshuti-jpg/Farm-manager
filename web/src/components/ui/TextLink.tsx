import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Common = {
  children: ReactNode;
  className?: string;
};

type AsButton = Common &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type AsAnchor = Common &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

/** Text-style action — replaces dead Button link variant and underline hacks. */
export function TextLink(props: AsButton | AsAnchor) {
  const disabled = "disabled" in props && Boolean(props.disabled);
  const className = `inline font-semibold text-[var(--primary-color)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline ${disabled ? "opacity-40" : ""} ${props.className ?? ""}`;

  if ("href" in props && props.href != null) {
    const { href, children, className: _c, ...rest } = props;
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  }

  const { children, className: _c, type = "button", ...rest } = props as AsButton;
  return (
    <button type={type} className={`${className} border-none bg-transparent p-0`} {...rest}>
      {children}
    </button>
  );
}
