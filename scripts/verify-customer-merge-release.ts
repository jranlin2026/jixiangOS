import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { prisma } from '../server/db/client';
import { verifyCustomerMergeReleaseGate } from '../server/services/customerMergeReleaseGate';

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const report = await verifyCustomerMergeReleaseGate(prisma, process.env);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}
