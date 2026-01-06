export type GenaiRequest = {
  question: string;
  tenant_key: string;
  sensor_code?: string | null;
  metric?: string | null;
  scenario?: string | null;
  data_profile?: string | null;
  time_window?: string | null;
};

export type GenaiResponse = {
  answer: string;
  context: Record<string, unknown>;
};
