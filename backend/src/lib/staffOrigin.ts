export function isStaffOriginAllowed(origin: string | undefined, staffOrigins: string[]) {
  return !origin || staffOrigins.includes(origin)
}
