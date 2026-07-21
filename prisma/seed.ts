import { PrismaClient } from '@prisma/client';
import { seedSystemBaseline } from '../server/services/systemSeedService';

const prisma = new PrismaClient();

async function main() {
  const [installation, userCount, leadCount, businessRecordCount] = await Promise.all([
    prisma.systemInstallation.findUnique({ where: { id: 'primary' } }),
    prisma.user.count(),
    prisma.leadRecord.count(),
    prisma.businessRecord.count(),
  ]);
  if (installation?.state === 'ACTIVE' || userCount > 0 || leadCount > 0 || businessRecordCount > 0) {
    throw new Error('REFUSING_SYSTEM_SEED_ON_INITIALIZED_DATABASE');
  }
  await seedSystemBaseline(prisma, {
    organizationTemplate: 'minimal',
    markInitialized: false,
    hasAdmin: false,
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
