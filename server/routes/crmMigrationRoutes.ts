import type { RequestHandler } from 'express';

export function createDisabledCrmCustomerImportHandler(): RequestHandler {
  return (_request, response) => {
    response.status(410).json({
      code: 410,
      data: null,
      message: '旧 CRM 客户导入已停用，请使用统一客户导入模板',
    });
  };
}
