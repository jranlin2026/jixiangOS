import assert from 'node:assert/strict';
import { collectProductionConfigErrors } from '../../scripts/deploy/check-production-config';

const validProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://jixiang_os:StrongDatabasePassword123!@127.0.0.1:3306/jixiang_os',
  AI_PROXY_PORT: '3001',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
  VITE_USE_BACKEND_API: 'true',
  VITE_AI_API_BASE: '/api',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword123!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword123!',
  JIXIANG_DEPLOY_BACKUP: 'true',
  JIXIANG_MYSQL_PASSWORD: 'StrongDatabasePassword123!',
  JIXIANG_BACKUP_DIR: '/var/backups/jixiang-os',
  JIXIANG_SMOKE_BASE_URL: 'https://crm.jixiang-ai.com',
  JIXIANG_SMOKE_PASSWORD: 'StrongAdminPassword123!',
};

assert.deepEqual(collectProductionConfigErrors(validProductionEnv), []);

assert.match(
  collectProductionConfigErrors({ ...validProductionEnv, NODE_ENV: 'development' }).join('\n'),
  /NODE_ENV/,
);

assert.match(
  collectProductionConfigErrors({ ...validProductionEnv, VITE_USE_BACKEND_API: 'false' }).join('\n'),
  /VITE_USE_BACKEND_API/,
);

assert.match(
  collectProductionConfigErrors({ ...validProductionEnv, VITE_AI_API_BASE: 'http:\/\/127.0.0.1:3001' }).join('\n'),
  /VITE_AI_API_BASE/,
);
