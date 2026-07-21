import { prisma } from '../server/db/client';
import { createPrismaSystemSetupRepository } from '../server/services/systemSetupRepository';

try {
  const record = await createPrismaSystemSetupRepository(prisma).resolve();
  process.stdout.write(record.state);
} finally {
  await prisma.$disconnect();
}
