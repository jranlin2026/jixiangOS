export interface EcommerceSettlementStats {
  orderCount: number;
  flowCount: number;
  talentCount: number;
  totalOrderAmount: number;
  totalFlowAmount: number;
  totalProductCost: number;
  totalShippingFee: number;
  totalFreightInsurance: number;
  estimatedProfit: number;
  exceptionCount: number;
}

export interface EcommerceOrderDetailRow {
  mainOrderId: string;
  subOrderId: string;
  orderMonth: string;
  submittedAt: string;
  completedAt: string;
  skuCode: string;
  quantity: number;
  talentId: string;
  talentName: string;
  payableAmount: number;
  platformDiscount: number;
  merchantDiscount: number;
  talentDiscount: number;
  productUnitCost: number;
  productCost: number;
  shippingFee: number;
  freightInsurance: number;
  flowAmount: number;
  estimatedProfit: number;
}

export interface EcommerceTalentSummaryRow {
  orderMonth: string;
  talentId: string;
  talentName: string;
  orderCount: number;
  payableAmount: number;
  flowAmount: number;
  productCost: number;
  shippingFee: number;
  freightInsurance: number;
  estimatedProfit: number;
}

export interface EcommerceFlowSummaryRow {
  dimension: string;
  count: number;
  incomeAmount: number;
  expenseAmount: number;
  netAmount: number;
}

export interface EcommerceFlowCheckRow {
  flowTime: string;
  direction: string;
  amount: number;
  signedAmount: number;
  scene: string;
  mainOrderId: string;
  subOrderId: string;
  matchStatus: 'matched' | 'unmatched';
  remark: string;
}

export interface EcommerceExceptionRow {
  type: string;
  level: 'high' | 'medium' | 'low';
  orderId: string;
  subOrderId: string;
  message: string;
  suggestion: string;
}

export interface EcommerceSettlementResult {
  orderDetailRows: EcommerceOrderDetailRow[];
  talentSummaryRows: EcommerceTalentSummaryRow[];
  flowSceneSummaryRows: EcommerceFlowSummaryRow[];
  flowMonthSummaryRows: EcommerceFlowSummaryRow[];
  flowCheckRows: EcommerceFlowCheckRow[];
  exceptionRows: EcommerceExceptionRow[];
  stats: EcommerceSettlementStats;
  coveredMonths: string[];
}

export interface EcommerceSettlementRecord extends EcommerceSettlementResult {
  id: string;
  storeName: string;
  generatedAt: string;
  version: string;
  shippingFee: number;
  uploadedFileNames: string[];
}

export interface EcommerceSettlementConfig {
  storeName: string;
  shippingFee: number;
}
