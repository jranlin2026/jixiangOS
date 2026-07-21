import { prisma } from '../server/db/client';

try {
  const rows = await prisma.$queryRaw<Array<{ tableCount: bigint | number }>>`
    SELECT COUNT(*) AS tableCount
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
  `;
  const tableCount = Number(rows[0]?.tableCount || 0);
  process.stdout.write(tableCount === 0 ? 'EMPTY' : 'NONEMPTY');
} finally {
  await prisma.$disconnect();
}
