export type CoCreationStatus =
  | 'DRAFT' | 'INTERVIEWING' | 'EMPLOYEE_CONFIRMATION' | 'FACT_CONFIRMATION'
  | 'MANAGEMENT_REVIEW' | 'VALIDATION_APPROVED' | 'VALIDATING' | 'PROJECT_DECISION'
  | 'APPROVED' | 'DEFERRED' | 'MERGED' | 'REJECTED';

export interface CoCreationMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CoCreationBriefDto {
  problemStatement: string;
  currentWorkflow: string;
  desiredOutcome: string;
  employeeStatements: string[];
  aiHypotheses: string[];
  confirmedFacts: string[];
  evidence: string[];
  openQuestions: string[];
  completeness: number;
  classification?: string;
  prioritySuggestion?: string;
}

export interface CoCreationValidationDto {
  plan: string[];
  evidence: string[];
  confirmedFacts: string[];
  metrics: string[];
  unresolvedQuestions: string[];
  recommendation?: string;
  conclusion?: string;
}

export interface CoCreationRequestDto {
  id: string;
  title: string;
  status: CoCreationStatus;
  requesterId: string;
  requesterName: string;
  departmentId?: string;
  decisionReason?: string;
  createdAt: string;
  updatedAt: string;
  messages?: CoCreationMessageDto[];
  brief?: CoCreationBriefDto | null;
  validation?: CoCreationValidationDto | null;
}

export interface InterviewTurnDto {
  reply: string;
  phase: string;
  completeness: number;
  briefReady: boolean;
}
