import { prisma } from '../server/db/client';
import { auditHistoricalCustomerAssociationIds } from '../server/services/customerAssociationRegistry';

const apply = process.argv.includes('--apply');
const checkpointFlag = process.argv.find((argument) => argument.startsWith('--checkpoint='));
const checkpointKey = checkpointFlag?.slice('--checkpoint='.length) || 'aaos_customer_association_audit_v1';

const summary = await auditHistoricalCustomerAssociationIds(prisma, { apply, checkpointKey });
console.info(JSON.stringify(summary, null, 2));

if (summary.repairRows.length > 0) process.exitCode = 2;
