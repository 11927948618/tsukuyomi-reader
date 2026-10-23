// The user identified these pre-release OTP records as obsolete test history.
// Do not hide newer OTP events, token checks, or records with an invalid date.
export function splitAdminAuthEvents(events = []) {
  const legacy = [], current = [];
  for (const event of events) {
    const time = Date.parse(event?.createdAt);
    const oldOtp = String(event?.type || '').startsWith('otp-')
      && Number.isFinite(time) && time <= Date.parse('2026-05-29T23:59:59.999+09:00');
    (oldOtp ? legacy : current).push(event);
  }
  return { current, legacy };
}
