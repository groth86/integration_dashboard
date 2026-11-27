// npm run wms:check — re-check recent pick tickets against CloudX and flag any
// stuck in "Imported with Errors".
//
// Intended to run on a schedule alongside the monitor. Safe to run repeatedly:
// it only ever moves a record between Success and Imported with Errors based on
// what the WMS currently reports.
import 'dotenv/config';
import { sweepAll } from '../lib/wmsSweep';

const DRY_RUN = ['1', 'true', 'yes'].includes((process.env.WMS_DRY_RUN || '').toLowerCase());
const LOOKBACK_HOURS = Number(process.env.WMS_LOOKBACK_HOURS || '48');
const LIMIT = Number(process.env.WMS_MAX_RECORDS_PER_ACCOUNT || '200');

async function main() {
  console.log(
    `[wms] dryRun=${DRY_RUN} lookbackHours=${LOOKBACK_HOURS} maxPerAccount=${LIMIT}`,
  );

  const results = await sweepAll({
    lookbackHours: LOOKBACK_HOURS,
    limit: LIMIT,
    dryRun: DRY_RUN,
  });

  if (!results.length) {
    console.log('[wms] no active accounts have CloudX checking enabled.');
    process.exit(0);
  }

  let totalErrors = 0;
  for (const r of results) {
    totalErrors += r.errors;
    const note = r.message ? `  (${r.message})` : '';
    console.log(
      `[wms] ${r.accountName}: checked=${r.checked} flagged=${r.flagged} ` +
        `cleared=${r.cleared} unchanged=${r.unchanged} errors=${r.errors}${note}`,
    );
  }

  console.log('[wms] done.');
  // A non-zero exit on API failures makes a scheduled run show up as failed
  // rather than quietly doing nothing for days.
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[wms] failed:', e);
  process.exit(1);
});
