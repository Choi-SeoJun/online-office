export type FeedbackCategory = 'bug' | 'idea' | 'other';
export type FeedbackStatus = 'new' | 'reviewed';
export type FeedbackContext = { mode: 'solo' | 'multi'; floor: 'office' | 'roof' };

export type FeedbackSubmission = {
  requestId: string;
  category: FeedbackCategory;
  message: string;
  context: FeedbackContext;
};

export type FeedbackRecord = FeedbackContext & {
  id: number;
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  createdAt: number;
  reviewedAt: number | null;
};

export type FeedbackList = {
  items: FeedbackRecord[];
  nextCursor: number | null;
  counts: Record<FeedbackStatus, number>;
};
