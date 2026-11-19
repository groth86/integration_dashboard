// npm run purge — clears request/response payloads older than
// PAYLOAD_CLEAR_AFTER_HOURS (default 24). Record rows themselves are kept.
// Schedule hourly (e.g. Railway Cron "0 * * * *"). Ingest also purges
// opportunistically, so this is the safety net for quiet periods.
import 'dotenv/config';
import { purgeExpiredPayloads, PAYLOAD_CLEAR_AFTER_HOURS } from '../lib/records';

purgeExpiredPayloads()
  .then((n) => {
    console.log(`[purge] cleared payloads on ${n} record(s) older than ${PAYLOAD_CLEAR_AFTER_HOURS}h`);
    process.exit(0);
  })
  .catch((e) => {
    console.error('[purge] failed:', e);
    process.exit(1);
  });
