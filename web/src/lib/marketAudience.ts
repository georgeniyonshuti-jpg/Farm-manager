export function isSellPath(pathname: string) {
  return pathname === "/market/sell" || pathname.startsWith("/market/sell/");
}
