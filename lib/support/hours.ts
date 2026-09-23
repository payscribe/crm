const SUPPORT_TIME_ZONE = "Africa/Lagos";
const SUPPORT_START_HOUR = 9;
const SUPPORT_END_HOUR = 17;

export const SUPPORT_HOURS_NOTICE =
  "Messages sent now may get a delayed response. Support typically replies 9am–5pm, Monday to Friday.";

export function isOutsideSupportHours(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SUPPORT_TIME_ZONE,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23"
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const weekday = parts.weekday;
  const hour = Number(parts.hour);

  if (weekday === "Sat" || weekday === "Sun") {
    return true;
  }

  return hour < SUPPORT_START_HOUR || hour >= SUPPORT_END_HOUR;
}
