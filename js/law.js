// Inspektr – South African legal checks for residential inspections.
// Rental Housing Act 50 of 1999, section 5 (as in force; the Amendment Act 35 of 2014 has not commenced),
// Property Practitioners Act 22 of 2019 (section 67) and POPIA (Act 4 of 2013).
// Plain-language guidance, not legal advice.

const DAY = 86400000;
const d = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`) : null);
export const addDays = (iso, n) => new Date(d(iso).getTime() + n * DAY).toISOString().slice(0, 10);
const diff = (a, b) => Math.round((d(a) - d(b)) / DAY);
const fmt = (iso) => d(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Returns the legal checks for an inspection.
 * Each row: { level: 'ok' | 'warn' | 'bad' | 'info', title, text }.
 * opts.deductions: number of deposit deductions on the report.
 */
export function legalChecks(ins, opts = {}) {
  const rows = [];
  const present = ins.tenantPresent !== false;
  const end = ins.leaseEnd || null;

  rows.push(ins.consent
    ? { level: 'ok', title: 'Recording consent (POPIA)', text: 'The people present were told that the walk-through is recorded on video and audio, and why. Recordings are kept only as long as needed for the lease and the deposit.' }
    : { level: 'warn', title: 'Recording consent (POPIA)', text: 'No consent was recorded for the video and audio. Tell everyone present that the inspection is recorded, why, and who will see it.' });

  if (ins.type === 'ingoing') {
    rows.push(present
      ? { level: 'ok', title: 'Joint ingoing inspection', text: 'Landlord (or agent) and tenant inspected the property together before the tenant moved in, as the Rental Housing Act requires. Defects found are recorded in this report and form part of the lease.' }
      : { level: 'bad', title: 'Joint ingoing inspection', text: 'The tenant was not present. The Act requires the landlord and tenant to inspect together before the tenant moves in. Arrange a joint inspection, or have the tenant check and sign this report.' });
    rows.push({ level: 'info', title: 'Deposit', text: 'The deposit must be invested in an interest-bearing account at no less than a savings-account rate. The interest belongs to the tenant, who may ask for proof of it at any time during the lease.' });
    if (ins.agentInvolved !== false) {
      rows.push(ins.disclosure
        ? { level: 'ok', title: 'Mandatory disclosure form', text: 'The landlord’s signed defect disclosure form is attached to the lease (Property Practitioners Act, s67).' }
        : { level: 'warn', title: 'Mandatory disclosure form', text: 'Where a property practitioner is involved, the landlord’s signed defect disclosure form must be attached to the lease (Property Practitioners Act, s67). Confirm it is on file.' });
    }
  }

  if (ins.type === 'outgoing') {
    if (!end) {
      rows.push({ level: 'warn', title: 'Lease end date', text: 'Add the lease end date so the inspection window and deposit refund deadlines can be checked.' });
    } else {
      const gap = diff(end, ins.date); // days before lease end (+) or after (−)
      if (present) {
        rows.push(gap >= 0 && gap <= 3
          ? { level: 'ok', title: 'Joint outgoing inspection', text: `Done jointly ${gap === 0 ? 'on the day the lease ends' : `${gap} day${gap === 1 ? '' : 's'} before the lease ends`} (${fmt(end)}). The Act requires this within the 3 days before the lease expires.` }
          : { level: 'warn', title: 'Joint outgoing inspection', text: `The Act requires the joint inspection within the 3 days before the lease expires (${fmt(addDays(end, -3))} to ${fmt(end)}). This one was ${gap > 3 ? `${gap} days early` : `${-gap} day${gap === -1 ? '' : 's'} after the lease ended`}. Note why on the report.` });
      } else {
        rows.push(gap <= 0 && gap >= -7
          ? { level: 'ok', title: 'Outgoing inspection without the tenant', text: `The tenant did not attend. The landlord must then inspect within 7 days after the lease ends; this was ${-gap} day${gap === -1 ? '' : 's'} after ${fmt(end)}. Keep proof that the tenant was invited.` }
          : { level: 'warn', title: 'Outgoing inspection without the tenant', text: `When the tenant does not attend, the landlord must inspect within 7 days after the lease ends (by ${fmt(addDays(end, 7))}). Keep proof that the tenant was invited.` });
      }
      const n = opts.deductions || 0;
      if (!present) {
        rows.push({ level: 'info', title: 'Deposit refund deadline', text: `Refund the deposit and interest, less the reasonable cost of damage and unpaid amounts, within 21 days of the lease ending: by ${fmt(addDays(end, 21))}.` });
      } else if (n) {
        rows.push({ level: 'info', title: 'Deposit refund deadline', text: `There ${n === 1 ? 'is 1 deduction' : `are ${n} deductions`}. Pay the balance of the deposit and interest within 14 days of the property being restored, and make the receipts for the repairs available to the tenant.` });
      } else {
        rows.push({ level: 'info', title: 'Deposit refund deadline', text: `No deductions. Refund the full deposit and interest within 7 days of the lease ending: by ${fmt(addDays(end, 7))}.` });
      }
    }
    rows.push({ level: 'info', title: 'Fair wear and tear', text: 'Fair wear and tear from normal use cannot be deducted from the deposit. Only damage beyond it, and unpaid amounts, may be. Compare with the ingoing report.' });
    rows.push({ level: 'info', title: 'If the landlord does not inspect', text: 'If the landlord fails to inspect, the Act treats the property as returned in good order and the full deposit and interest must be refunded.' });
  }

  if (ins.type === 'routine') {
    rows.push({ level: 'info', title: 'Routine inspection', text: 'The landlord may inspect at a reasonable time, after reasonable notice to the tenant, and must respect the tenant’s privacy.' });
  }
  return rows;
}

export const LAW_SOURCE = 'Rental Housing Act 50 of 1999, s5 (Amendment Act 35 of 2014 not yet in force); Property Practitioners Act 22 of 2019, s67; Protection of Personal Information Act 4 of 2013. This is guidance, not legal advice.';

const MARK = { ok: '✓', warn: '!', bad: '!', info: 'i' };
export function lawRowsHTML(rows, esc) {
  return `<div class="law">${rows.map((r) => `<div class="law-row ${r.level}"><span class="ic" aria-hidden="true">${MARK[r.level]}</span><div><b>${esc(r.title)}</b><span>${esc(r.text)}</span></div></div>`).join('')}</div>`;
}
